// Ported from the web app's src/lib/detection/streakClusterHelper.ts, unchanged.

import { debug } from '@/lib/debug';
import { calculateSortWeight } from '@/lib/priority-scoring';
import { supabase } from '@/lib/supabase';

import { checkSustainedDeviationQuality } from './data-quality-checks';

/**
 * Shared "sustained deviation streak → detected_clusters row" upsert. Both
 * quality-checks the streak's data coverage, scores it, finds any existing
 * overlapping cluster for the same domain+direction, then updates or inserts.
 */
export async function upsertStreakCluster(params: {
  userId: string;
  domain: string;
  direction: 'elevated' | 'depressed';
  streak: { date: string; deviation: number }[];
  allClusters: any[];
  today: string;
  checkInsInPeriod: number;
  checkInsPerDay: number;
  /** Mind-only sleep-context fields (avg_sleep_during_pattern, improved_with_sleep,
   *  high_despite_poor_sleep); omitted entirely for body-domain clusters. */
  extraFields?: Record<string, unknown>;
  /** debug.log source tag — differs so log lines stay attributable to their detector. */
  logSource: string;
  onInsertError: (error: unknown) => void;
}): Promise<void> {
  const { userId, domain, direction, streak, allClusters, today, checkInsInPeriod, checkInsPerDay, extraFields = {}, logSource, onInsertError } = params;

  const streakStart = streak[0].date;
  const streakEnd = streak[streak.length - 1].date;
  const isOngoing = streakEnd >= today;

  const meanDeviation = streak.reduce((sum, s) => sum + s.deviation, 0) / streak.length;
  const severity = Math.round(streak.length * meanDeviation * 10) / 10;

  const qualityCheck = checkSustainedDeviationQuality(checkInsInPeriod, streak.length, checkInsPerDay);
  if (!qualityCheck.isValid) {
    debug.log(logSource, `Skipping sustained_deviation ${domain} ${streakStart}→${streakEnd}:`, {
      actualPoints: qualityCheck.actualPoints,
      expectedPoints: qualityCheck.expectedPoints,
      reason: 'insufficient coverage',
    });
    return;
  }

  const dataPointsUsed = qualityCheck.actualPoints;
  const dataPointsExpected = qualityCheck.expectedPoints;
  const dataQuality = qualityCheck.dataQuality;

  const clusterForScoring = {
    cluster_type: 'sustained_deviation',
    direction,
    domains_involved: [domain],
    severity_score: severity,
    start_date: streakStart,
    end_date: isOngoing ? null : streakEnd,
    ongoing: isOngoing,
    data_quality: dataQuality,
    ...extraFields,
  };
  const sortWeight = calculateSortWeight(clusterForScoring);

  const existing = allClusters.find(c => {
    if (!c.domains_involved?.includes(domain)) return false;
    if (c.direction !== direction) return false;
    const clusterStart: string = c.start_date;
    const clusterEnd: string | null = c.end_date;
    return clusterStart <= streakEnd && (clusterEnd === null || clusterEnd >= streakStart);
  });

  if (existing) {
    const newStart = existing.start_date < streakStart ? existing.start_date : streakStart;
    await supabase
      .from('detected_clusters')
      .update({
        start_date: newStart,
        end_date: isOngoing ? null : streakEnd,
        ongoing: isOngoing,
        direction,
        severity_score: severity,
        data_points_used: dataPointsUsed,
        data_points_expected: dataPointsExpected,
        data_quality: dataQuality,
        sort_weight: sortWeight,
        ...extraFields,
      })
      .eq('id', existing.id);
  } else {
    const { error: insertErr } = await supabase.from('detected_clusters').insert({
      user_id: userId,
      cluster_type: 'sustained_deviation',
      start_date: streakStart,
      end_date: isOngoing ? null : streakEnd,
      ongoing: isOngoing,
      domains_involved: [domain],
      direction,
      severity_score: severity,
      enrichment_completed: false,
      data_points_used: dataPointsUsed,
      data_points_expected: dataPointsExpected,
      data_quality: dataQuality,
      sort_weight: sortWeight,
      ...extraFields,
    });
    if (insertErr) onInsertError(insertErr);
  }
}
