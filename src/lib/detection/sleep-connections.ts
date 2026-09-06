// ── Sleep connection detection ──────────────────────────────────────────────
// Direct port of the web app's src/lib/detection/sleepConnections.ts. Runs
// weekly via pattern-detection-scheduler. Works out which domains are
// meaningfully affected by sleep quality, by splitting each domain's scores by
// the previous night's sleep score and comparing the two group means.
//
// Requires ≥21 sleep logs, ≥14 check-ins for a domain, and ≥5 scores in each
// of the good-sleep (≥4) and poor-sleep (≤2) groups. A gap of ≥1.5 points
// counts as affected.
//
// Note the column: sleep_logs.score. The web version read felt_rested, which
// was replaced by score back in the v1.4 migration and no longer exists — so
// that query errored and the detector returned empty every time it ran. Fixed
// on the web side alongside this port.
//
// COMPLIANCE:
//   - avg_after_good_sleep / avg_after_poor_sleep stored internally, NEVER shown
//   - difference stored internally, NEVER shown
//   - UI copy uses: "tends to be higher/lower after good sleep"

import { BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import { debug } from '@/lib/debug';
import { supabase } from '@/lib/supabase';
import type { BodyDomainType } from '@/lib/supabase';

const WINDOW_DAYS = 30;
const MIN_SLEEP_LOGS = 21;
const MIN_CHECKINS = 14;
const MIN_SLEEP_GROUP = 5;
const AFFECTED_THRESHOLD = 1.5;

export async function detectSleepConnections(userId: string): Promise<void> {
  debug.log('Sleep Connections', 'Starting detection for user:', userId);

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 86_400_000);
  const startStr = windowStart.toLocaleDateString('en-CA');
  const endStr = windowEnd.toLocaleDateString('en-CA');

  const { data: sleepLogs } = await supabase
    .from('sleep_logs')
    .select('log_date, score')
    .eq('user_id', userId)
    .gte('log_date', startStr)
    .lte('log_date', endStr)
    .eq('skipped', false);

  if (!sleepLogs || sleepLogs.length < MIN_SLEEP_LOGS) {
    debug.log('Sleep Connections', 'Insufficient sleep logs:', sleepLogs?.length ?? 0, `(need ${MIN_SLEEP_LOGS}+)`);
    return;
  }

  const { data: settings } = await supabase
    .from('check_in_settings')
    .select('active_domains')
    .eq('user_id', userId)
    .single();

  if (!settings?.active_domains || settings.active_domains.length === 0) {
    debug.log('Sleep Connections', 'No active domains');
    return;
  }

  const sleepByDate = new Map<string, number>(
    (sleepLogs as { log_date: string; score: number }[]).map(log => [log.log_date, log.score]),
  );

  let connectionsFound = 0;

  // Shared grouping + upsert, reused for mind domains (raw check-ins) and body
  // domains (daily body check-ins) below — the good/poor-sleep split doesn't
  // care which table a domain's scores came from.
  async function evaluateDomain(domain: string, scoresByDate: Map<string, number>) {
    const afterGoodSleep: number[] = [];
    const afterPoorSleep: number[] = [];

    scoresByDate.forEach((score, date) => {
      const sleepQuality = sleepByDate.get(date);
      if (sleepQuality === undefined || sleepQuality === null) return;
      if (sleepQuality >= 4) afterGoodSleep.push(score);
      else if (sleepQuality <= 2) afterPoorSleep.push(score);
    });

    if (afterGoodSleep.length < MIN_SLEEP_GROUP || afterPoorSleep.length < MIN_SLEEP_GROUP) {
      debug.log('Sleep Connections', `${domain}: insufficient good/poor sleep days (good=${afterGoodSleep.length}, poor=${afterPoorSleep.length})`);
      return;
    }

    const avgAfterGood = afterGoodSleep.reduce((s, v) => s + v, 0) / afterGoodSleep.length;
    const avgAfterPoor = afterPoorSleep.reduce((s, v) => s + v, 0) / afterPoorSleep.length;
    const difference = Math.abs(avgAfterGood - avgAfterPoor);
    const affectedBySleep = difference >= AFFECTED_THRESHOLD;

    debug.log('Sleep Connections', `${domain}: good=${avgAfterGood.toFixed(1)}, poor=${avgAfterPoor.toFixed(1)}, diff=${difference.toFixed(1)}, affected=${affectedBySleep}`);

    const { error } = await supabase.from('sleep_symptom_connections').upsert({
      user_id: userId,
      domain,
      affected_by_sleep: affectedBySleep,
      avg_after_good_sleep: avgAfterGood,
      avg_after_poor_sleep: avgAfterPoor,
      difference,
      sample_size: afterGoodSleep.length + afterPoorSleep.length,
      good_sleep_count: afterGoodSleep.length,
      poor_sleep_count: afterPoorSleep.length,
      window_start: startStr,
      window_end: endStr,
    }, { onConflict: 'user_id,domain,window_start' });

    if (error) debug.error('Sleep Connections', 'Upsert error:', error);
    else if (affectedBySleep) connectionsFound++;
  }

  const activeDomains = settings.active_domains as string[];

  // One query covering every active domain's column, rather than one per
  // domain — each domain still applies its own non-null filter below.
  const { data: rawCheckIns } = await supabase
    .from('check_ins')
    .select(`scheduled_date, ${activeDomains.join(', ')}`)
    .eq('user_id', userId)
    .gte('scheduled_date', startStr)
    .lte('scheduled_date', endStr)
    .eq('status', 'completed');

  const allCheckIns = (rawCheckIns as unknown as { scheduled_date: string; [key: string]: unknown }[] | null) ?? [];

  for (const domain of activeDomains) {
    const checkIns = allCheckIns.filter(ci => ci[domain] !== null && ci[domain] !== undefined);
    if (checkIns.length < MIN_CHECKINS) {
      debug.log('Sleep Connections', `${domain}: only ${checkIns.length} check-ins (need ${MIN_CHECKINS}+)`);
      continue;
    }
    const scoresByDate = new Map<string, number>();
    for (const ci of checkIns) scoresByDate.set(ci.scheduled_date, ci[domain] as number);
    await evaluateDomain(domain, scoresByDate);
  }

  // ── Body domains ────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('body_tracking_enabled, body_domains_active')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.body_tracking_enabled) {
    // Filter rather than cast — see body-cluster-detection.ts for why
    // 'exertion' (a legacy value still in body_domains_active's DB default)
    // is excluded.
    const activeFromProfile = ((profile.body_domains_active as string[] | null) ?? [])
      .filter((d): d is BodyDomainType => (BODY_DOMAIN_ORDER as string[]).includes(d));
    const bodyDomains: BodyDomainType[] = activeFromProfile.length > 0 ? activeFromProfile : BODY_DOMAIN_ORDER;

    const { data: bodyCheckIns } = await supabase
      .from('body_checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('entry_date', startStr)
      .lte('entry_date', endStr);

    if (bodyCheckIns && bodyCheckIns.length >= MIN_CHECKINS) {
      for (const domain of bodyDomains) {
        const scoresByDate = new Map<string, number>();
        for (const bc of bodyCheckIns as Record<string, unknown>[]) {
          const v = dailyBodyValue(bc, domain);
          if (v !== null) scoresByDate.set(bc.entry_date as string, v);
        }
        if (scoresByDate.size < MIN_CHECKINS) {
          debug.log('Sleep Connections', `${domain}: only ${scoresByDate.size} body check-ins (need ${MIN_CHECKINS}+)`);
          continue;
        }
        await evaluateDomain(domain, scoresByDate);
      }
    }
  }

  debug.log('Sleep Connections', `Detection complete. ${connectionsFound} sleep-affected domain(s).`);
}
