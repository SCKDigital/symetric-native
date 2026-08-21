import AsyncStorage from '@react-native-async-storage/async-storage';

import { runClusterDetection } from '@/lib/cluster-detection';
import { supabase } from '@/lib/supabase';

/**
 * Scoped port of the web app's src/lib/patternDetectionScheduler.ts — just
 * the daily cluster-detection throttle. NOT ported yet: weekly domain/sleep/
 * body-mind connection detection, rolling baseline recalculation, baseline
 * shift detection, and pinned-connection re-evaluation — each depends on
 * detector modules not ported to native yet (a later chunk of the
 * multi-session Insights port). Also not ported: body cluster detection
 * (`runBodyClusterDetection`), since body check-ins aren't ported yet either.
 *
 * Mechanic swap: `localStorage` → `AsyncStorage`, so this needs `await`
 * where the web version reads/writes synchronously.
 */

const lastPatternDetectionKey = (userId: string) => `lastPatternDetection_${userId}`;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Run cluster detection only if it hasn't already run today for this user.
 * Returns true if it actually ran, false if skipped (already run today, or
 * the user has no completed check-ins yet).
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
    await runClusterDetection(userId);
    await AsyncStorage.setItem(lastPatternDetectionKey(userId), todayStr());
  }

  return ranClusters;
}

/** Force cluster detection regardless of throttle state. */
export async function forcePatternDetection(userId: string): Promise<void> {
  await runClusterDetection(userId);
  await AsyncStorage.setItem(lastPatternDetectionKey(userId), todayStr());
}
