// ── Domain connection detection ────────────────────────────────────────────────
// Direct port of the web app's src/lib/detection/domainConnections.ts. Runs
// weekly via pattern-detection-scheduler. Detects strong Pearson correlations
// between mind-domain pairs from raw check-in scores (not daily averages —
// pairing at check-in level keeps within-day covariation, which averaging
// would flatten).
//
// Nothing wrote mind×mind rows on native before this. Insights and the report
// both read domain_connections, but only body×mind rows were ever produced
// here, so a native-only user never saw a mind-domain correlation at all.
//
// Results are persisted to domain_connections for cross-session access and
// consistency tracking (did the same correlation hold last month too?).
//
// COMPLIANCE:
//   - strength (r-value) is stored internally but NEVER shown to users
//   - p-values guide inclusion but are never surfaced
//   - UI copy uses: "tend to move together", "Based on N check-ins"

import { computeRawConnection } from '@/lib/detection/compute-connection';
import { debug } from '@/lib/debug';
import { resolveActiveDomains } from '@/lib/domains';
import { supabase } from '@/lib/supabase';

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

function nDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

/** All k-combinations of an array. */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k > arr.length) return [];
  if (k === 1) return arr.map(x => [x]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const tail of combinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...tail]);
    }
  }
  return result;
}

// Early-exit guard — mirrors CORRELATION_MIN_OVERLAP inside
// computeRawConnection (performance only; the real gate is in there).
const MIN_OVERLAPPING_CHECKINS = 14;
const WINDOW_DAYS = 30;
const CONSISTENCY_STRENGTH_TOLERANCE = 0.15;

const DOMAIN_COLUMNS = [
  'mood', 'energy', 'anxiety', 'concentration',
  'irritability', 'social_battery', 'sensory_sensitivity', 'motivation',
];

/**
 * Detect domain correlations over the past 30 days, upserting into
 * domain_connections. Runs weekly — do not call on every screen mount.
 */
export async function detectDomainConnections(userId: string): Promise<void> {
  const windowEnd = todayStr();
  const windowStart = nDaysAgoStr(WINDOW_DAYS);

  debug.log('Domain Connections', `Detecting for user ${userId} — window: ${windowStart} → ${windowEnd}`);

  const [{ data: settings }, { data: rawCheckIns }] = await Promise.all([
    supabase
      .from('check_in_settings')
      .select('active_domains, quick_checkin_domains')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('check_ins')
      .select(`scheduled_at, ${DOMAIN_COLUMNS.join(', ')}`)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('scheduled_at', `${windowStart}T00:00:00`)
      .lte('scheduled_at', `${windowEnd}T23:59:59`)
      .order('scheduled_at', { ascending: true }),
  ]);

  if (!rawCheckIns || rawCheckIns.length < MIN_OVERLAPPING_CHECKINS) {
    debug.log('Domain Connections', `Only ${rawCheckIns?.length ?? 0} check-ins — too few to detect`);
    return;
  }

  const activeDomains = resolveActiveDomains(settings);
  if (activeDomains.length < 2) {
    debug.log('Domain Connections', 'Fewer than 2 active domains — skipping');
    return;
  }

  const rows = rawCheckIns as unknown as Record<string, unknown>[];
  const pairs = combinations(activeDomains as string[], 2);
  debug.log('Domain Connections', `Checking ${pairs.length} pairs across ${rows.length} check-ins`);

  let found = 0;

  for (const [dA, dB] of pairs) {
    // Alphabetical ordering satisfies the table's CHECK constraint.
    const [domainA, domainB] = dA < dB ? [dA, dB] : [dB, dA];

    // Only check-ins where BOTH domains have a score.
    const paired = rows.filter(ci =>
      ci[domainA] !== null && ci[domainA] !== undefined &&
      ci[domainB] !== null && ci[domainB] !== undefined);

    if (paired.length < MIN_OVERLAPPING_CHECKINS) {
      debug.log('Domain Connections', `${domainA}×${domainB}: only ${paired.length} overlapping — skip`);
      continue;
    }

    const corr = computeRawConnection(
      paired.map(ci => ci[domainA] as number),
      paired.map(ci => ci[domainB] as number),
    );

    debug.log('Domain Connections', `${domainA}×${domainB}: r=${corr._r.toFixed(3)}, n=${paired.length}`);
    if (corr.direction === 'none') continue;

    const movesTogether = corr.direction === 'together';
    const consistentPattern = await checkConsistency(userId, domainA, domainB, movesTogether, Math.abs(corr._r));

    const { error } = await supabase.from('domain_connections').upsert({
      user_id: userId,
      domain_a: domainA,
      domain_b: domainB,
      moves_together: movesTogether,
      strength: Math.round(Math.abs(corr._r) * 10000) / 10000,
      sample_size: paired.length,
      window_start: windowStart,
      window_end: windowEnd,
      consistent_pattern: consistentPattern,
      detected_at: new Date().toISOString(),
    }, { onConflict: 'user_id,domain_a,domain_b,window_start' });

    if (error) {
      debug.error('Domain Connections', `Upsert error for ${domainA}×${domainB}:`, error);
    } else {
      debug.log('Domain Connections', `✓ ${domainA} ${movesTogether ? '↔' : '↕'} ${domainB} (r=${Math.abs(corr._r).toFixed(2)}, n=${paired.length}, consistent=${consistentPattern})`);
      found++;
    }
  }

  debug.log('Domain Connections', `Done — ${found} connection${found !== 1 ? 's' : ''} upserted`);
}

/**
 * True when this pair showed the same direction and a similar strength in the
 * previous 30-day window. Surfaced to the reader only as "held steady", never
 * as a number.
 */
async function checkConsistency(
  userId: string,
  domainA: string,
  domainB: string,
  currentMovesTogether: boolean,
  currentStrength: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('domain_connections')
    .select('moves_together, strength')
    .eq('user_id', userId)
    .eq('domain_a', domainA)
    .eq('domain_b', domainB)
    .gte('window_start', nDaysAgoStr(WINDOW_DAYS * 2))
    .lt('window_start', nDaysAgoStr(WINDOW_DAYS))
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return false;

  const sameDirection = data.moves_together === currentMovesTogether;
  const similarStrength = Math.abs((data.strength as number) - currentStrength) <= CONSISTENCY_STRENGTH_TOLERANCE;
  return sameDirection && similarStrength;
}
