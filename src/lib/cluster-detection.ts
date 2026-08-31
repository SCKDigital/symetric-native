import { debug } from '@/lib/debug';
import { detectCircadianPatterns } from '@/lib/circadian-detection';
import { checkRapidCyclingQuality } from '@/lib/detection/data-quality-checks';
import { detectIntradayVolatility, detectWeeklyOscillations } from '@/lib/detection/cluster-shape-detectors';
import { upsertStreakCluster } from '@/lib/detection/streak-cluster-helper';
import { median } from '@/lib/baseline-stats';
import { calculateSortWeight } from '@/lib/priority-scoring';
import { resolveActiveDomains } from '@/lib/domains';
import { CheckIn, DomainType, supabase } from '@/lib/supabase';

/**
 * Cluster detection — multi-day sustained or cycling deviations from personal
 * baseline (plus intraday volatility swings), surfaced on Insights as
 * "Worth Discussing With Your Doctor". Ported from the web app's
 * src/lib/clusterDetection.ts — a complete, faithful port including the
 * inline `detectCircadianPatterns` call (see circadian-detection.ts; chunk 1
 * deferred this, chunk 2 closes the gap).
 */

const ALL_DOMAINS: DomainType[] = ['mood', 'energy', 'anxiety', 'concentration', 'irritability', 'social_battery', 'sensory_sensitivity', 'motivation'];

interface DailyDomainScore {
  date: string;
  scores: Partial<Record<DomainType | 'sleep', number>>;
}

interface DomainFlag {
  domain: DomainType | 'sleep';
  direction: 'elevated' | 'depressed';
  deviation: number;
}

interface DailyFlags {
  date: string;
  flags: DomainFlag[];
}

export async function runClusterDetection(userId: string): Promise<void> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [{ data: checkIns }, { data: sleepLogs }, { data: baselines }, { data: allClusters }, { data: settings }] = await Promise.all([
    supabase.from('check_ins').select('*').eq('user_id', userId).eq('status', 'completed').gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: true }),
    supabase.from('sleep_logs').select('*').eq('user_id', userId).eq('skipped', false).gte('log_date', ninetyDaysAgo.toLocaleDateString('en-CA')).order('log_date', { ascending: true }),
    supabase.from('baselines').select('*').eq('user_id', userId).eq('is_current', true),
    supabase.from('detected_clusters').select('*').eq('user_id', userId).gte('start_date', ninetyDaysAgo.toLocaleDateString('en-CA')),
    supabase.from('check_in_settings').select('active_domains, quick_checkin_domains, check_ins_per_day').eq('user_id', userId).single(),
  ]);

  if (!checkIns || checkIns.length === 0) return;

  const resolved = resolveActiveDomains(settings);
  const activeDomains: DomainType[] = resolved.length > 0 ? resolved : ALL_DOMAINS;
  const checkInsPerDay: number = settings?.check_ins_per_day ?? 3;

  const baselineMap: Partial<Record<DomainType | 'sleep', number>> = {};
  baselines?.forEach(b => {
    if (activeDomains.includes(b.domain as DomainType) || b.domain === 'sleep') {
      baselineMap[b.domain as DomainType] = b.baseline_score;
    }
  });

  const dayMap = new Map<string, { domainSums: Partial<Record<DomainType | 'sleep', number[]>> }>();

  checkIns.forEach(ci => {
    const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    if (!dayMap.has(date)) dayMap.set(date, { domainSums: {} });
    const entry = dayMap.get(date)!;
    activeDomains.forEach(d => {
      const val = ci[d as keyof typeof ci];
      if (val !== null && val !== undefined) {
        if (!entry.domainSums[d]) entry.domainSums[d] = [];
        entry.domainSums[d]!.push(val as number);
      }
    });
  });

  sleepLogs?.forEach(sl => {
    if (sl.score !== null && sl.score !== undefined) {
      if (!dayMap.has(sl.log_date)) dayMap.set(sl.log_date, { domainSums: {} });
      const entry = dayMap.get(sl.log_date)!;
      if (!entry.domainSums['sleep']) entry.domainSums['sleep'] = [];
      entry.domainSums['sleep']!.push(sl.score);
    }
  });

  const dailyScores: DailyDomainScore[] = [];
  dayMap.forEach((entry, date) => {
    const scores: Partial<Record<DomainType | 'sleep', number>> = {};
    (Object.entries(entry.domainSums) as [DomainType | 'sleep', number[]][]).forEach(([d, vals]) => {
      scores[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    dailyScores.push({ date, scores });
  });

  dailyScores.sort((a, b) => a.date.localeCompare(b.date));

  const domainScoreHistory: Partial<Record<DomainType | 'sleep', number[]>> = {};

  const flaggedDays: DailyFlags[] = dailyScores.map(({ date, scores }) => {
    const flags: DomainFlag[] = [];
    const allDomains: (DomainType | 'sleep')[] = [...activeDomains, 'sleep'];

    allDomains.forEach(d => {
      const val = scores[d];
      if (val === undefined) return;

      if (!domainScoreHistory[d]) domainScoreHistory[d] = [];
      domainScoreHistory[d]!.push(val);

      const history = domainScoreHistory[d]!;
      const base = history.length >= 7 ? median(history.slice(-14)) : (baselineMap[d] ?? (d === 'sleep' ? 3 : 5));

      const deviation = val - base;
      if (Math.abs(deviation) >= 2) {
        flags.push({ domain: d, direction: deviation > 0 ? 'elevated' : 'depressed', deviation: Math.abs(deviation) });
      }
    });

    return { date, flags };
  });

  const allDomains: (DomainType | 'sleep')[] = [...activeDomains, 'sleep'];
  const today = new Date().toLocaleDateString('en-CA');

  const streakUpsertPromises: Promise<void>[] = [];

  for (const domain of allDomains) {
    for (const direction of ['elevated', 'depressed'] as const) {
      let streak: { date: string; deviation: number }[] = [];

      for (const dayFlag of flaggedDays) {
        const domainFlag = dayFlag.flags.find(f => f.domain === domain && f.direction === direction);

        if (domainFlag) {
          streak.push({ date: dayFlag.date, deviation: domainFlag.deviation });
        } else {
          if (streak.length >= 3) {
            streakUpsertPromises.push(upsertCluster(userId, domain, direction, streak, allClusters ?? [], today, checkIns ?? [], sleepLogs ?? [], checkInsPerDay));
          }
          streak = [];
        }
      }

      if (streak.length >= 3) {
        streakUpsertPromises.push(upsertCluster(userId, domain, direction, streak, allClusters ?? [], today, checkIns ?? [], sleepLogs ?? [], checkInsPerDay));
      }
    }
  }

  await Promise.all(streakUpsertPromises);

  // ── Intraday volatility ────────────────────────────────────────────────────

  for (const domain of activeDomains) {
    const volatilityPatterns = detectIntradayVolatility(checkIns, domain);
    for (const { date, swingMagnitude } of volatilityPatterns) {
      const existing = (allClusters ?? []).find(c => c.cluster_type === 'intraday_volatility' && c.start_date === date && Array.isArray(c.domains_involved) && c.domains_involved.includes(domain) && c.domains_involved.length === 1);
      const checkInsOnDay = (checkIns ?? []).filter(ci => {
        const ciDate = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
        return ciDate === date && ci[domain] !== null && ci[domain] !== undefined;
      }).length;

      const volatilityQuality: 'solid' | 'partial' = checkInsOnDay >= 3 ? 'solid' : 'partial';
      const volatilityCluster = {
        cluster_type: 'intraday_volatility' as const,
        domains_involved: [domain],
        volatility_score: swingMagnitude,
        severity_score: swingMagnitude * 10,
        data_points_used: checkInsOnDay,
        data_points_expected: checkInsPerDay,
        data_quality: volatilityQuality,
        sort_weight: 0,
        start_date: date,
        end_date: date,
      };
      volatilityCluster.sort_weight = calculateSortWeight(volatilityCluster);

      if (existing) {
        await supabase
          .from('detected_clusters')
          .update({
            volatility_score: swingMagnitude,
            severity_score: swingMagnitude * 10,
            data_points_used: checkInsOnDay,
            data_points_expected: checkInsPerDay,
            data_quality: volatilityQuality,
            sort_weight: volatilityCluster.sort_weight,
          })
          .eq('id', existing.id);
      } else {
        const { error: insertErr } = await supabase.from('detected_clusters').insert({
          user_id: userId,
          start_date: date,
          end_date: date,
          ongoing: false,
          cluster_type: 'intraday_volatility',
          direction: null,
          domains_involved: [domain],
          volatility_score: swingMagnitude,
          severity_score: swingMagnitude * 10,
          enrichment_completed: false,
          data_points_used: checkInsOnDay,
          data_points_expected: checkInsPerDay,
          data_quality: volatilityQuality,
          sort_weight: volatilityCluster.sort_weight,
        });
        if (insertErr) console.error('[cluster insert intraday_volatility]', insertErr);
      }
    }
  }

  // ── Weekly oscillation ─────────────────────────────────────────────────────
  // Only run if mood is being tracked

  const moodBaseline = baselineMap['mood'];
  if (activeDomains.includes('mood') && moodBaseline !== undefined) {
    const dailyMoodAvgs = dailyScores.map(ds => ({ date: ds.date, avg: ds.scores['mood'] })).filter((d): d is { date: string; avg: number } => d.avg !== undefined);

    const oscillationPatterns = detectWeeklyOscillations(dailyMoodAvgs, moodBaseline);
    for (const { startDate, endDate, numSwitches, meanDeviation } of oscillationPatterns) {
      const windowDates = dailyMoodAvgs.filter(d => d.date >= startDate && d.date <= endDate).map(d => d.date);
      const windowDays = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
      const cyclingQuality = checkRapidCyclingQuality(windowDates, windowDays);
      if (!cyclingQuality.isValid) {
        debug.log('Data Quality', `Skipping rapid_cycling ${startDate}→${endDate}:`, {
          daysWithData: cyclingQuality.actualPoints,
          windowDays,
          reason: 'insufficient data coverage',
        });
        continue;
      }

      const existing = (allClusters ?? []).find(c => c.cluster_type === 'rapid_cycling' && c.start_date <= endDate && (c.end_date === null || c.end_date >= startDate));
      const severity = Math.round(numSwitches * meanDeviation * 10) / 10;
      const cyclingCluster = {
        cluster_type: 'rapid_cycling' as const,
        domains_involved: ['mood'],
        volatility_score: numSwitches,
        severity_score: severity,
        start_date: startDate,
        end_date: endDate,
      };
      const cyclingSortWeight = calculateSortWeight(cyclingCluster);

      if (existing) {
        await supabase
          .from('detected_clusters')
          .update({
            start_date: existing.start_date < startDate ? existing.start_date : startDate,
            end_date: endDate,
            volatility_score: numSwitches,
            severity_score: severity,
            sort_weight: cyclingSortWeight,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('detected_clusters').insert({
          user_id: userId,
          start_date: startDate,
          end_date: endDate,
          ongoing: false,
          cluster_type: 'rapid_cycling',
          direction: null,
          domains_involved: ['mood'],
          volatility_score: numSwitches,
          severity_score: severity,
          enrichment_completed: false,
          sort_weight: cyclingSortWeight,
        });
      }
    }
  }

  // ── Circadian pattern detection ────────────────────────────────────────────

  await detectCircadianPatterns(userId);

  const openClusters = (allClusters ?? []).filter(c => !c.end_date);

  for (const cluster of openClusters) {
    const primaryDomain = cluster.domains_involved?.[0];
    if (!primaryDomain) continue;

    const recentDays = flaggedDays.slice(-2);
    if (recentDays.length < 2) continue;

    const allReturned = recentDays.every(d => {
      return !d.flags.some(f => f.domain === primaryDomain && f.direction === cluster.direction);
    });

    if (allReturned) {
      const lastFlaggedDate = flaggedDays.filter(d => d.flags.some(f => f.domain === primaryDomain && f.direction === cluster.direction)).slice(-1)[0]?.date ?? today;

      await supabase.from('detected_clusters').update({ end_date: lastFlaggedDate, ongoing: false }).eq('id', cluster.id);
    }
  }
}

async function upsertCluster(userId: string, domain: DomainType | 'sleep', direction: 'elevated' | 'depressed', streak: { date: string; deviation: number }[], allClusters: any[], today: string, checkIns: CheckIn[], sleepLogs: any[], checkInsPerDay: number): Promise<void> {
  const streakStart = streak[0].date;
  const streakEnd = streak[streak.length - 1].date;

  const checkInsInPeriod = checkIns.filter(ci => {
    const ciDate = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    return ciDate >= streakStart && ciDate <= streakEnd && (domain === 'sleep' ? true : ci[domain] !== null && ci[domain] !== undefined);
  }).length;

  const sleepInPeriod = sleepLogs.filter(sl => !sl.skipped && sl.score != null && sl.log_date >= streakStart && sl.log_date <= streakEnd);

  let avgSleepDuringPattern: number | null = null;
  let improvedWithSleep: boolean | null = null;
  let highDespitePoorSleep: boolean | null = null;

  if (sleepInPeriod.length >= 2) {
    avgSleepDuringPattern = sleepInPeriod.reduce((s: number, sl: any) => s + sl.score, 0) / sleepInPeriod.length;

    const sleepByDate = new Map<string, number>(sleepInPeriod.map((sl: any) => [sl.log_date, sl.score]));

    if (domain !== 'sleep') {
      const poorSleepDays = checkIns.filter(ci => {
        const ciDate = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
        return ciDate >= streakStart && ciDate <= streakEnd && ci[domain] !== null && (sleepByDate.get(ciDate) ?? 10) <= 4;
      });
      const goodSleepDays = checkIns.filter(ci => {
        const ciDate = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
        return ciDate >= streakStart && ciDate <= streakEnd && ci[domain] !== null && (sleepByDate.get(ciDate) ?? 0) >= 7;
      });

      if (poorSleepDays.length >= 2 && goodSleepDays.length >= 2) {
        const avgPoorSleep = poorSleepDays.reduce((s: number, ci: any) => s + ci[domain], 0) / poorSleepDays.length;
        const avgGoodSleep = goodSleepDays.reduce((s: number, ci: any) => s + ci[domain], 0) / goodSleepDays.length;
        improvedWithSleep = avgGoodSleep - avgPoorSleep >= 1.5;
      }

      if (domain === 'energy' && direction === 'elevated') {
        const highEnergyPoorSleepDays = checkIns.filter(ci => {
          const ciDate = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
          return ciDate >= streakStart && ciDate <= streakEnd && ci.energy != null && ci.energy >= 8 && (sleepByDate.get(ciDate) ?? 10) <= 4;
        }).length;
        highDespitePoorSleep = highEnergyPoorSleepDays >= 3;
      }
    }
  }

  await upsertStreakCluster({
    userId,
    domain,
    direction,
    streak,
    allClusters,
    today,
    checkInsInPeriod,
    checkInsPerDay,
    extraFields: {
      avg_sleep_during_pattern: avgSleepDuringPattern,
      improved_with_sleep: improvedWithSleep,
      high_despite_poor_sleep: highDespitePoorSleep,
    },
    logSource: 'Data Quality',
    onInsertError: err => console.error('[cluster insert sustained_deviation]', err),
  });
}

export async function fetchClustersForDateRange(userId: string, from: string, to: string) {
  const { data } = await supabase
    .from('detected_clusters')
    .select('*, context_tags(tag)')
    .eq('user_id', userId)
    .lte('start_date', to)
    .or(`end_date.gte.${from},end_date.is.null`)
    .order('start_date', { ascending: false });
  return data ?? [];
}
