/**
 * Rolling median baseline recalculation. Direct port of the web app's
 * src/lib/baseline/rollingBaselineRecalc.ts — same window, same floors, same
 * append-only write pattern.
 *
 * This was the most consequential thing missing from the native port. Nothing
 * recalculated baselines here, and no server job does it either, so a
 * native-only user's baselines stayed frozen at whatever onboarding set them
 * to, forever. Baselines are not just display values: rare-event detection,
 * pattern evolution and the cluster thresholds all measure against them, so a
 * stale baseline quietly miscalibrates every one of those as the person's
 * actual range moves. It fails silently, which is what makes it worth having.
 *
 * Fires weekly when the app is opened (throttled in
 * pattern-detection-scheduler.ts). Baselines can therefore be up to 7 days
 * stale for active users and arbitrarily stale for inactive ones — a known
 * tradeoff matching the existing detection cadence, not a bug.
 *
 * Writes are append-only: the previous is_current=true row for a domain is
 * flipped to false before the new one is inserted. Onboarding rows are never
 * overwritten; they stay with is_current=false as history.
 */

import { median, round2, stddevPop } from '@/lib/baseline-stats';
import { debug } from '@/lib/debug';
import { resolveActiveDomains } from '@/lib/domains';
import { supabase } from '@/lib/supabase';

const WINDOW_DAYS = 30;
const MIN_DAYS = 14;    // minimum distinct scheduled_dates in the window
const MIN_SCORES = 14;  // minimum non-null scores for a single domain

export interface RecalcResult {
  updated: string[];
  skipped: string[];
  reason?: string;
}

export async function recalculateRollingBaseline(userId: string): Promise<RecalcResult> {
  const { data: settings, error: settingsError } = await supabase
    .from('check_in_settings')
    .select('active_domains, quick_checkin_domains')
    .eq('user_id', userId)
    .maybeSingle();

  if (settingsError) {
    debug.error('Rolling Baseline', 'Failed to fetch settings:', settingsError);
    return { updated: [], skipped: [], reason: 'settings_error' };
  }

  const activeDomains = resolveActiveDomains(settings);
  if (activeDomains.length === 0) {
    debug.log('Rolling Baseline', 'No active domains — skipping');
    return { updated: [], skipped: [], reason: 'no_settings' };
  }

  // scheduled_date is a plain date column, so the window boundary is
  // timezone-safe in a way a timestamp comparison would not be.
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  const { data: checkIns, error: checkInsError } = await supabase
    .from('check_ins')
    .select('scheduled_date, mood, energy, anxiety, concentration, irritability, social_battery, sensory_sensitivity, motivation')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('scheduled_date', windowStart.toLocaleDateString('en-CA'));

  if (checkInsError || !checkIns) {
    debug.error('Rolling Baseline', 'Failed to fetch check-ins:', checkInsError);
    return { updated: [], skipped: activeDomains as string[], reason: 'fetch_error' };
  }

  // Distinct days, not rows — four check-ins in one day is one day's evidence.
  const distinctDates = new Set(checkIns.map(ci => ci.scheduled_date as string)).size;
  if (distinctDates < MIN_DAYS) {
    debug.log('Rolling Baseline', `Insufficient days: ${distinctDates} < ${MIN_DAYS}`);
    return { updated: [], skipped: activeDomains as string[], reason: 'insufficient_days' };
  }

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const domain of activeDomains) {
    const scores: number[] = checkIns
      .map(ci => (ci as Record<string, unknown>)[domain] as number | null)
      .filter((v): v is number => v !== null && v !== undefined);

    if (scores.length < MIN_SCORES) {
      debug.log('Rolling Baseline', `${domain}: only ${scores.length} scores, need ${MIN_SCORES} — skipping`);
      skipped.push(domain);
      continue;
    }

    const baselineScore = round2(median(scores));
    const baselineVariability = round2(stddevPop(scores));

    const { error: flipError } = await supabase
      .from('baselines')
      .update({ is_current: false })
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('is_current', true);

    if (flipError) {
      debug.error('Rolling Baseline', `${domain}: failed to flip is_current:`, flipError);
      skipped.push(domain);
      continue;
    }

    const { error: insertError } = await supabase.from('baselines').insert({
      user_id: userId,
      domain,
      baseline_score: baselineScore,
      baseline_variability: baselineVariability,
      source: 'rolling_median',
      set_at: new Date().toISOString(),
      is_current: true,
    });

    if (insertError) {
      debug.error('Rolling Baseline', `${domain}: insert failed:`, insertError);
      // The flip already happened, so this domain now has no current row at
      // all — worse than a stale one, since detection would have nothing to
      // measure against. Best-effort restore of the most recent row.
      await supabase
        .from('baselines')
        .update({ is_current: true })
        .eq('user_id', userId)
        .eq('domain', domain)
        .order('set_at', { ascending: false })
        .limit(1);
      skipped.push(domain);
      continue;
    }

    updated.push(domain);
    debug.log('Rolling Baseline', `${domain}: score=${baselineScore}, variability=${baselineVariability}`);
  }

  debug.log('Rolling Baseline', `Done — updated: [${updated.join(', ')}] skipped: [${skipped.join(', ')}]`);
  return { updated, skipped };
}
