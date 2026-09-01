// Ported from the web app's src/lib/detection/bodyMindConnections.ts, unchanged.
//
// Runs weekly via pattern-detection-scheduler.ts, alongside mind-domain
// connection detection (not yet ported to native — domainConnections.ts,
// deferred). That file correlates mind-domain pairs on raw intraday
// check-ins; body is logged once daily, so there's no matching intraday
// grain to pair against. This detector instead correlates at DAILY
// granularity — one averaged value per mind domain per day, one value per
// body domain per day, same shape sleepConnections.ts already uses for
// sleep (also not yet ported) — for any pair where at least one side is a
// body domain (body×mind, body×body, body×sleep). Persists to the same
// domain_connections table; domain_a/domain_b are plain text with no value
// CHECK constraint, so body domain names are valid rows there too.
//
// COMPLIANCE: same as domainConnections.ts — strength (r) is internal only.

import { computeRawConnection } from '@/lib/detection/compute-connection';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import { BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { resolveActiveDomains } from '@/lib/domains';
import { debug } from '@/lib/debug';
import { BodyDomainType, supabase } from '@/lib/supabase';

const WINDOW_DAYS = 30;
const MIN_OVERLAP = 14;

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

function nDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

export async function detectBodyMindConnections(userId: string): Promise<void> {
  const windowEnd = todayStr();
  const windowStart = nDaysAgoStr(WINDOW_DAYS);

  const [{ data: profile }, { data: settings }, { data: checkIns }, { data: sleepLogs }, { data: bodyCheckIns }] =
    await Promise.all([
      supabase.from('profiles').select('body_tracking_enabled, body_domains_active').eq('id', userId).maybeSingle(),
      supabase.from('check_in_settings').select('active_domains, quick_checkin_domains').eq('user_id', userId).maybeSingle(),
      supabase.from('check_ins').select('scheduled_at, mood, energy, anxiety, concentration, irritability, social_battery, sensory_sensitivity, motivation')
        .eq('user_id', userId).eq('status', 'completed')
        .gte('scheduled_at', windowStart + 'T00:00:00').lte('scheduled_at', windowEnd + 'T23:59:59'),
      supabase.from('sleep_logs').select('log_date, score').eq('user_id', userId).eq('skipped', false)
        .gte('log_date', windowStart).lte('log_date', windowEnd),
      supabase.from('body_checkins').select('*').eq('user_id', userId)
        .gte('entry_date', windowStart).lte('entry_date', windowEnd),
    ]);

  if (!profile?.body_tracking_enabled) {
    debug.log('Body-Mind Connections', 'Body tracking disabled — skipping');
    return;
  }
  if (!bodyCheckIns || bodyCheckIns.length < MIN_OVERLAP) {
    debug.log('Body-Mind Connections', `Only ${bodyCheckIns?.length ?? 0} body check-ins — too few`);
    return;
  }

  const mindDomains = resolveActiveDomains(settings);
  // Filter rather than cast — see body-cluster-detection.ts for why
  // 'exertion' (a legacy value still in body_domains_active's DB default)
  // is excluded.
  const activeFromProfile = ((profile.body_domains_active as string[] | null) ?? [])
    .filter((d): d is BodyDomainType => (BODY_DOMAIN_ORDER as string[]).includes(d));
  const bodyDomains: BodyDomainType[] = activeFromProfile.length > 0 ? activeFromProfile : BODY_DOMAIN_ORDER;

  // Build one daily-average value per factor (mind domains, body domains, sleep).
  const dayMap = new Map<string, Partial<Record<string, number[]>>>();

  for (const ci of (checkIns ?? []) as Record<string, unknown>[]) {
    const date = new Date(ci.scheduled_at as string).toLocaleDateString('en-CA');
    if (!dayMap.has(date)) dayMap.set(date, {});
    const entry = dayMap.get(date)!;
    for (const d of mindDomains) {
      const val = ci[d];
      if (typeof val === 'number') {
        if (!entry[d]) entry[d] = [];
        entry[d]!.push(val);
      }
    }
  }
  for (const sl of (sleepLogs ?? []) as Record<string, unknown>[]) {
    const date = sl.log_date as string;
    if (typeof sl.score !== 'number') continue;
    if (!dayMap.has(date)) dayMap.set(date, {});
    const entry = dayMap.get(date)!;
    if (!entry['sleep']) entry['sleep'] = [];
    entry['sleep']!.push(sl.score as number);
  }
  for (const bc of (bodyCheckIns ?? []) as Record<string, unknown>[]) {
    const date = bc.entry_date as string;
    if (!dayMap.has(date)) dayMap.set(date, {});
    const entry = dayMap.get(date)!;
    for (const d of bodyDomains) {
      const val = dailyBodyValue(bc, d);
      if (val !== null) {
        if (!entry[d]) entry[d] = [];
        entry[d]!.push(val);
      }
    }
  }

  const dailyAverages = new Map<string, Partial<Record<string, number>>>();
  dayMap.forEach((factorArrays, date) => {
    const scores: Partial<Record<string, number>> = {};
    for (const [factor, vals] of Object.entries(factorArrays)) {
      if (!vals || vals.length === 0) continue;
      scores[factor] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    dailyAverages.set(date, scores);
  });

  // Only pairs where at least one side is a body domain — mind×mind is
  // already covered by the (not yet ported) domainConnections.ts's raw-
  // check-in method, and duplicating it at daily grain here would produce a
  // second, differently-computed number for the same pair.
  const bodySideFactors: string[] = bodyDomains;
  const otherFactors: string[] = [...mindDomains, 'sleep', ...bodyDomains];

  // Collect every qualifying pair first, then upsert them all in one batched
  // call instead of one round-trip per pair.
  const detectedAt = new Date().toISOString();
  const rows: {
    user_id: string; domain_a: string; domain_b: string; moves_together: boolean;
    strength: number; sample_size: number; window_start: string; window_end: string;
    consistent_pattern: boolean; detected_at: string;
  }[] = [];

  for (const factorA of bodySideFactors) {
    for (const factorB of otherFactors) {
      if (factorA === factorB) continue;
      // Body×body pairs: only evaluate each unordered pair once.
      if (bodySideFactors.includes(factorB) && factorA >= factorB) continue;

      const xs: number[] = [];
      const ys: number[] = [];
      dailyAverages.forEach(scores => {
        const a = scores[factorA];
        const b = scores[factorB];
        if (a !== undefined && b !== undefined) { xs.push(a); ys.push(b); }
      });

      if (xs.length < MIN_OVERLAP) continue;

      const corr = computeRawConnection(xs, ys);
      if (corr.direction === 'none') continue;

      const [domain_a, domain_b] = factorA < factorB ? [factorA, factorB] : [factorB, factorA];

      rows.push({
        user_id: userId,
        domain_a,
        domain_b,
        moves_together: corr.direction === 'together',
        strength: Math.round(Math.abs(corr._r) * 10000) / 10000,
        sample_size: xs.length,
        window_start: windowStart,
        window_end: windowEnd,
        consistent_pattern: false,
        detected_at: detectedAt,
      });
    }
  }

  let found = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from('domain_connections')
      .upsert(rows, { onConflict: 'user_id,domain_a,domain_b,window_start' });
    if (error) {
      debug.error('Body-Mind Connections', 'Batch upsert error:', error);
    } else {
      found = rows.length;
    }
  }

  debug.log('Body-Mind Connections', `Done — ${found} connection(s) upserted`);
}
