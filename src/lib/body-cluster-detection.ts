import { checkRapidCyclingQuality } from '@/lib/detection/data-quality-checks';
import { detectWeeklyOscillations } from '@/lib/detection/cluster-shape-detectors';
import { rollingBodyBaseline } from '@/lib/detection/body-baseline';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import { upsertStreakCluster } from '@/lib/detection/streak-cluster-helper';
import { BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { calculateSortWeight } from '@/lib/priority-scoring';
import { debug } from '@/lib/debug';
import { BodyDomainType, supabase } from '@/lib/supabase';

/**
 * Body-domain sustained deviation + flare/remission cycling — the body
 * analog of cluster-detection.ts's mind-domain detection, persisted to the
 * same detected_clusters table (domains_involved is a plain text[] with no
 * value constraint, so body domain names are valid rows there too). Ported
 * from the web app's src/lib/bodyClusterDetection.ts, unchanged.
 *
 * Differences from the mind version:
 *  - No intraday volatility: body is logged once daily, so there's nothing
 *    to swing between within a single day.
 *  - No stored baseline: bootstraps from the check-in history itself via
 *    rollingBodyBaseline (see that file for why).
 *  - checkInsPerDay is always 1.
 */

const DEVIATION_THRESHOLD = 2;
const MIN_STREAK = 3;
const CHECK_INS_PER_DAY = 1;

interface DailyBodyScore {
  date: string;
  scores: Partial<Record<BodyDomainType, number>>;
}

export async function runBodyClusterDetection(userId: string): Promise<void> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const from = ninetyDaysAgo.toLocaleDateString('en-CA');
  const today = new Date().toLocaleDateString('en-CA');

  const [{ data: profile }, { data: bodyCheckIns }, { data: allClusters }] = await Promise.all([
    supabase.from('profiles').select('body_tracking_enabled, body_domains_active').eq('id', userId).maybeSingle(),
    supabase.from('body_checkins').select('*').eq('user_id', userId).gte('entry_date', from).order('entry_date', { ascending: true }),
    supabase.from('detected_clusters').select('*').eq('user_id', userId).gte('start_date', from),
  ]);

  if (!profile?.body_tracking_enabled) return;
  if (!bodyCheckIns || bodyCheckIns.length === 0) return;

  // Filter rather than cast: body_domains_active's DB default still includes
  // the legacy 'exertion' value from before it was replaced by 'exhaustion'
  // — it isn't a valid BodyDomainType and has no BODY_DOMAINS config entry,
  // so drop it here rather than let it reach any label/color lookup.
  const activeFromProfile = ((profile.body_domains_active as string[] | null) ?? [])
    .filter((d): d is BodyDomainType => (BODY_DOMAIN_ORDER as string[]).includes(d));
  const activeDomains: BodyDomainType[] = activeFromProfile.length > 0 ? activeFromProfile : BODY_DOMAIN_ORDER;

  const dailyScores: DailyBodyScore[] = bodyCheckIns.map((entry: Record<string, unknown>) => {
    const scores: Partial<Record<BodyDomainType, number>> = {};
    for (const domain of activeDomains) {
      const v = dailyBodyValue(entry, domain);
      if (v !== null) scores[domain] = v;
    }
    return { date: entry.entry_date as string, scores };
  });

  const history: Partial<Record<BodyDomainType, number[]>> = {};
  interface DomainFlag { domain: BodyDomainType; direction: 'elevated' | 'depressed'; deviation: number; }
  const flaggedDays: { date: string; flags: DomainFlag[] }[] = dailyScores.map(({ date, scores }) => {
    const flags: DomainFlag[] = [];
    for (const domain of activeDomains) {
      const val = scores[domain];
      if (val === undefined) continue;
      if (!history[domain]) history[domain] = [];
      history[domain]!.push(val);
      const base = rollingBodyBaseline(history[domain]!);
      const deviation = val - base;
      if (Math.abs(deviation) >= DEVIATION_THRESHOLD) {
        flags.push({ domain, direction: deviation > 0 ? 'elevated' : 'depressed', deviation: Math.abs(deviation) });
      }
    }
    return { date, flags };
  });

  // ── Sustained deviation streaks ─────────────────────────────────────────
  for (const domain of activeDomains) {
    for (const direction of ['elevated', 'depressed'] as const) {
      let streak: { date: string; deviation: number }[] = [];

      const flushStreak = async () => {
        if (streak.length >= MIN_STREAK) {
          await upsertBodyStreakCluster(userId, domain, direction, streak, allClusters ?? [], today, bodyCheckIns);
        }
        streak = [];
      };

      for (const dayFlag of flaggedDays) {
        const flag = dayFlag.flags.find(f => f.domain === domain && f.direction === direction);
        if (flag) {
          streak.push({ date: dayFlag.date, deviation: flag.deviation });
        } else {
          await flushStreak();
        }
      }
      await flushStreak();
    }
  }

  // ── Flare/remission cycling ─────────────────────────────────────────────
  for (const domain of activeDomains) {
    const domainHistory = history[domain];
    if (!domainHistory || domainHistory.length < 4) continue;
    const baseline = rollingBodyBaseline(domainHistory);

    const dailyAvgs = dailyScores
      .map(ds => ({ date: ds.date, avg: ds.scores[domain] }))
      .filter((d): d is { date: string; avg: number } => d.avg !== undefined);

    const oscillations = detectWeeklyOscillations(dailyAvgs, baseline);
    for (const { startDate, endDate, numSwitches, meanDeviation } of oscillations) {
      const windowDates = dailyAvgs.filter(d => d.date >= startDate && d.date <= endDate).map(d => d.date);
      const windowDays = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
      const quality = checkRapidCyclingQuality(windowDates, windowDays);
      if (!quality.isValid) continue;

      const existing = (allClusters ?? []).find(c =>
        c.cluster_type === 'rapid_cycling' &&
        Array.isArray(c.domains_involved) && c.domains_involved.includes(domain) &&
        c.start_date <= endDate && (c.end_date === null || c.end_date >= startDate)
      );
      const severity = Math.round(numSwitches * meanDeviation * 10) / 10;
      const clusterForScoring = {
        cluster_type: 'rapid_cycling', domains_involved: [domain], volatility_score: numSwitches,
        severity_score: severity, start_date: startDate, end_date: endDate,
      };
      const sortWeight = calculateSortWeight(clusterForScoring);

      if (existing) {
        await supabase.from('detected_clusters').update({
          start_date: existing.start_date < startDate ? existing.start_date : startDate,
          end_date: endDate, volatility_score: numSwitches, severity_score: severity, sort_weight: sortWeight,
        }).eq('id', existing.id);
      } else {
        const { error } = await supabase.from('detected_clusters').insert({
          user_id: userId, start_date: startDate, end_date: endDate, ongoing: false,
          cluster_type: 'rapid_cycling', direction: null, domains_involved: [domain],
          volatility_score: numSwitches, severity_score: severity, enrichment_completed: false, sort_weight: sortWeight,
        });
        if (error) debug.error('Body Cluster Detection', 'rapid_cycling insert failed:', error);
      }
    }
  }

  // ── Close out streaks that have returned to baseline ────────────────────
  const openClusters = (allClusters ?? []).filter(c => !c.end_date && c.cluster_type === 'sustained_deviation');
  for (const cluster of openClusters) {
    const domain = cluster.domains_involved?.[0] as BodyDomainType | undefined;
    if (!domain || !activeDomains.includes(domain)) continue;
    const recentDays = flaggedDays.slice(-2);
    if (recentDays.length < 2) continue;
    const allReturned = recentDays.every(d => !d.flags.some(f => f.domain === domain && f.direction === cluster.direction));
    if (allReturned) {
      const lastFlaggedDate = flaggedDays
        .filter(d => d.flags.some(f => f.domain === domain && f.direction === cluster.direction))
        .slice(-1)[0]?.date ?? today;
      await supabase.from('detected_clusters').update({ end_date: lastFlaggedDate, ongoing: false }).eq('id', cluster.id);
    }
  }
}

async function upsertBodyStreakCluster(
  userId: string,
  domain: BodyDomainType,
  direction: 'elevated' | 'depressed',
  streak: { date: string; deviation: number }[],
  allClusters: any[],
  today: string,
  bodyCheckIns: Record<string, unknown>[],
): Promise<void> {
  const streakStart = streak[0].date;
  const streakEnd = streak[streak.length - 1].date;

  const checkInsInPeriod = bodyCheckIns.filter(ci => {
    const date = ci.entry_date as string;
    return date >= streakStart && date <= streakEnd && dailyBodyValue(ci, domain) !== null;
  }).length;

  await upsertStreakCluster({
    userId,
    domain,
    direction,
    streak,
    allClusters,
    today,
    checkInsInPeriod,
    checkInsPerDay: CHECK_INS_PER_DAY,
    logSource: 'Body Cluster Detection',
    onInsertError: err => debug.error('Body Cluster Detection', 'sustained_deviation insert failed:', err),
  });
}
