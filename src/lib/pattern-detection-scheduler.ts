import AsyncStorage from '@react-native-async-storage/async-storage';

import { recalculateRollingBaseline } from '@/lib/baseline/rolling-baseline-recalc';
import { runClusterDetection } from '@/lib/cluster-detection';
import { runBodyClusterDetection } from '@/lib/body-cluster-detection';
import { detectBodyMindConnections } from '@/lib/detection/body-mind-connections';
import { detectDomainConnections } from '@/lib/detection/domain-connections';
import { detectSleepConnections } from '@/lib/detection/sleep-connections';
import { debug } from '@/lib/debug';
import { supabase } from '@/lib/supabase';

/**
 * Scoped port of the web app's src/lib/patternDetectionScheduler.ts — the
 * daily cluster-detection throttle, now covering both mind (runClusterDetection)
 * and body (runBodyClusterDetection, a no-op for users without body tracking
 * enabled) — same "independent detectors, disjoint domain sets, no shared
 * writes" Promise.all as the web version — plus the weekly body-mind
 * connection detection throttle — now covering mind-domain, sleep and
 * body-mind connections, as the web scheduler does — plus the weekly rolling
 * baseline recalculation. NOT ported yet: baseline shift detection and
 * pinned-connection re-evaluation.
 *
 * Mechanic swap: `localStorage` → `AsyncStorage`, so this needs `await`
 * where the web version reads/writes synchronously. The weekly throttle
 * also swaps date-string equality for an elapsed-ms comparison (matching
 * the web version's own CONNECTION_DETECTION_INTERVAL_DAYS logic, just
 * with AsyncStorage's string storage instead of localStorage).
 */

const CONNECTION_DETECTION_INTERVAL_DAYS = 7;
const MS_PER_DAY = 86_400_000;

const lastPatternDetectionKey = (userId: string) => `lastPatternDetection_${userId}`;
const lastConnectionDetectionKey = (userId: string) => `lastConnectionDetection_${userId}`;
const lastBaselineRecalcKey = (userId: string) => `lastBaselineRecalc_${userId}`;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Run cluster detection only if it hasn't already run today for this user.
 * Also runs connection detection and the baseline recalc weekly. Returns true if cluster
 * detection was actually run, false if skipped (already run today, or the
 * user has no completed check-ins yet).
 */
export async function runPatternDetectionIfNeeded(userId: string): Promise<boolean> {
  // Brand-new users (and anyone with zero completed check-ins) have nothing
  // for detection to find. Without this gate, a first-ever Insights mount
  // runs the detector purely to have it bail out internally.
  const { count } = await supabase.from('check_ins').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed').limit(1);
  if (!count) return false;

  const last = await AsyncStorage.getItem(lastPatternDetectionKey(userId));
  const ranClusters = last !== todayStr();
  if (ranClusters) {
    await Promise.all([
      runClusterDetection(userId),
      runBodyClusterDetection(userId).catch(e => debug.error('Pattern Detection', 'body cluster detection failed:', e)),
    ]);
    await AsyncStorage.setItem(lastPatternDetectionKey(userId), todayStr());
  }

  const lastConnectionTs = await AsyncStorage.getItem(lastConnectionDetectionKey(userId));
  const msSinceLastConnection = lastConnectionTs ? Date.now() - parseInt(lastConnectionTs, 10) : Infinity;
  if (msSinceLastConnection >= CONNECTION_DETECTION_INTERVAL_DAYS * MS_PER_DAY) {
    debug.log('Pattern Detection', 'Running weekly connection detection');
    // Same order as the web scheduler. Each is caught separately so one
    // failing detector doesn't cost the others their weekly run.
    await detectDomainConnections(userId).catch(e => debug.error('Pattern Detection', 'domain connection detection failed:', e));
    await detectSleepConnections(userId).catch(e => debug.error('Pattern Detection', 'sleep connection detection failed:', e));
    await detectBodyMindConnections(userId).catch(e => debug.error('Pattern Detection', 'body-mind connection detection failed:', e));
    await AsyncStorage.setItem(lastConnectionDetectionKey(userId), Date.now().toString());
  }

  // Weekly: rolling median baseline recalculation. Cadence is
  // user-activity-driven, so baselines can be up to 7 days stale for active
  // users and arbitrarily stale for inactive ones — the same accepted
  // tradeoff the web app documents, and the same cadence as everything above.
  const lastBaselineRecalcTs = await AsyncStorage.getItem(lastBaselineRecalcKey(userId));
  const msSinceLastBaselineRecalc = lastBaselineRecalcTs ? Date.now() - parseInt(lastBaselineRecalcTs, 10) : Infinity;
  if (msSinceLastBaselineRecalc >= CONNECTION_DETECTION_INTERVAL_DAYS * MS_PER_DAY) {
    debug.log('Pattern Detection', 'Running weekly rolling baseline recalculation');
    const recalcResult = await recalculateRollingBaseline(userId)
      .catch(e => { debug.error('Pattern Detection', 'baseline recalc failed:', e); return null; });
    if (recalcResult?.reason) {
      debug.log('Pattern Detection', `Baseline recalc skipped: ${recalcResult.reason}`);
    } else if (recalcResult) {
      debug.log('Pattern Detection', `Baseline recalc done — updated: [${recalcResult.updated.join(', ')}]`);
    }
    // Stamped even on failure, so a persistently failing recalc retries weekly
    // rather than on every single app open.
    await AsyncStorage.setItem(lastBaselineRecalcKey(userId), Date.now().toString());
  }

  return ranClusters;
}

/** Force cluster and connection detection regardless of throttle state. */
export async function forcePatternDetection(userId: string): Promise<void> {
  await Promise.all([
    runClusterDetection(userId),
    runBodyClusterDetection(userId).catch(e => debug.error('Pattern Detection', 'body cluster detection failed:', e)),
  ]);
  await AsyncStorage.setItem(lastPatternDetectionKey(userId), todayStr());

  await detectDomainConnections(userId).catch(e => debug.error('Pattern Detection', 'domain connection detection failed:', e));
  await detectSleepConnections(userId).catch(e => debug.error('Pattern Detection', 'sleep connection detection failed:', e));
  await detectBodyMindConnections(userId).catch(e => debug.error('Pattern Detection', 'body-mind connection detection failed:', e));
  await AsyncStorage.setItem(lastConnectionDetectionKey(userId), Date.now().toString());
}
