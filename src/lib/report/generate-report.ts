import { buildDayScores } from '@/lib/day-scores';
import { detectInterventionImpacts } from '@/lib/detection/intervention-impact';
import { detectDayOfWeekPatterns } from '@/lib/detection/day-of-week-patterns';
import { detectLagRelationships } from '@/lib/detection/lag-relationships';
import { detectPatternEvolution } from '@/lib/detection/pattern-evolution';
import { detectRareEvents } from '@/lib/detection/rare-events';
import type { CircadianPattern } from '@/lib/circadian-detection';
import { resolveActiveDomains } from '@/lib/domains';
import { median } from '@/lib/baseline-stats';
import { calculateSortWeight } from '@/lib/priority-scoring';
import { fetchQuestionsForAppointment } from '@/lib/api/questions';
import { fetchPatternReviewsForAppointment } from '@/lib/api/pattern-reviews';
import { buildPage1Html } from '@/lib/report/page1-html';
import { supabase } from '@/lib/supabase';
import type { DetectedCluster, PrepareQuestion } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

export interface GenerateReportInput {
  userId: string;
  userName?: string;
  dateFrom: string;
  dateTo: string;
  /** Unfiltered — every cluster (mind or body) in range, same as the web
   *  app's own `clusters` prop; this port only ever reads mind-domain ones
   *  since body tracking isn't ported yet. */
  clusters: DetectedCluster[];
  appointmentId?: string;
}

/**
 * Chunk 1 of the PDF report port (see project_rn_rewrite_scoping.md):
 * Page 1 (Executive Summary) only, mind-only. Renders an HTML string via
 * buildPage1Html and hands it to expo-print, then opens the native share
 * sheet — the RN equivalent of the web version's auto-download anchor
 * click (there's no browser download folder on native to drop a file
 * into). NOT ported yet: report name field (uses profile.report_display_name
 * / display_name / email directly, no in-place edit), mind/body/cycle
 * include toggles (mind is the only option until body tracking exists),
 * copy-as-markdown, and every page after Page 1 (Mind Overview with
 * sparkline charts, Context & Connections, Data Quality & Methodology).
 */
export async function generateReport(input: GenerateReportInput): Promise<{ uri: string }> {
  const { userId, userName, dateFrom, dateTo, clusters, appointmentId } = input;

  const [
    { data: checkIns },
    { data: sleepLogs },
    { data: baselines },
    { data: settings },
    { data: markersData },
    { data: circadianPatterns },
    patternReviews,
    questions,
  ] = await Promise.all([
    supabase.from('check_ins').select('*').eq('user_id', userId).eq('status', 'completed')
      .gte('scheduled_at', dateFrom + 'T00:00:00Z').lte('scheduled_at', dateTo + 'T23:59:59Z')
      .order('scheduled_at', { ascending: true }),
    supabase.from('sleep_logs').select('*').eq('user_id', userId)
      .gte('log_date', dateFrom).lte('log_date', dateTo).order('log_date', { ascending: true }),
    supabase.from('baselines').select('*').eq('user_id', userId).eq('is_current', true),
    supabase.from('check_in_settings').select('active_domains, quick_checkin_domains').eq('user_id', userId).maybeSingle(),
    supabase.from('intervention_markers').select('*').eq('user_id', userId)
      .gte('marker_date', dateFrom).lte('marker_date', dateTo).order('marker_date', { ascending: false }),
    // Overlapping-window filter matches the web app's own query exactly;
    // fetchCircadianPatterns only has a lower bound, not this range's upper
    // one, so this queries the table directly rather than reusing it.
    supabase.from('circadian_patterns').select('*').eq('user_id', userId)
      .gte('detection_window_end', dateFrom).lte('detection_window_start', dateTo),
    appointmentId ? fetchPatternReviewsForAppointment(appointmentId).catch(() => []) : Promise.resolve([]),
    appointmentId ? fetchQuestionsForAppointment(appointmentId).catch(() => []) : Promise.resolve([]),
  ]);

  const activeDomains = resolveActiveDomains(settings);
  const markers = (markersData ?? []) as InterventionMarker[];
  const dayScores = buildDayScores(checkIns, sleepLogs);

  const baselineMap: Record<string, number> = { sleep: 3 };
  (baselines ?? []).forEach(b => { baselineMap[b.domain] = b.baseline_score; });

  const currentRollingMedians: Record<string, number> = {};
  for (const domain of activeDomains) {
    const vals = dayScores.map(d => d.scores[domain]).filter((v): v is number => v != null);
    if (vals.length > 0) currentRollingMedians[domain] = median(vals);
  }

  const reviewMap: Record<string, { should_discuss?: boolean | null }> = {};
  patternReviews.forEach(r => { reviewMap[r.pattern_id] = r; });
  // calculateSortWeight requires cluster_type: string; DetectedCluster's is
  // optional (a cluster row without one shouldn't occur in practice, but
  // the type doesn't guarantee it) — default to '' so an untyped edge case
  // just sorts last rather than throwing.
  const sortWeight = (c: DetectedCluster) => calculateSortWeight({ ...c, cluster_type: c.cluster_type ?? '' });
  const flaggedClusters = clusters
    .filter(c => c.flagged_for_report === true || reviewMap[c.id]?.should_discuss === true)
    .sort((a, b) => sortWeight(b) - sortWeight(a));

  const dayOfWeekPatterns = detectDayOfWeekPatterns(dayScores, activeDomains);
  const lagRelationships = detectLagRelationships(dayScores, activeDomains);
  const rareEvents = detectRareEvents(dayScores, activeDomains, baselineMap);
  const patternEvolution = detectPatternEvolution(dayScores, activeDomains, baselineMap);
  const interventionImpacts = detectInterventionImpacts(markers, dayScores, activeDomains);

  const completedCheckIns = (checkIns ?? []).length; // already filtered to status='completed'
  const { count: totalScheduled } = await supabase
    .from('check_ins').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    .gte('scheduled_at', dateFrom + 'T00:00:00Z').lte('scheduled_at', dateTo + 'T23:59:59Z');

  const storedQuestions: PrepareQuestion[] = [...questions].sort((a, b) => a.sort_order - b.sort_order);

  const generationDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = buildPage1Html({
    userName,
    dateFrom,
    dateTo,
    generationDate,
    completedCheckIns,
    totalScheduled: totalScheduled ?? 0,
    trackedDomains: activeDomains,
    baselineMap,
    currentRollingMedians,
    questions: storedQuestions,
    flaggedClusters,
    lagRelationships,
    dayOfWeekPatterns,
    circadianPatterns: (circadianPatterns ?? []) as CircadianPattern[],
    rareEvents,
    patternEvolution,
    interventionImpacts,
  });

  const { printToFileAsync } = await import('expo-print');
  const { uri } = await printToFileAsync({ html, base64: false });
  return { uri };
}
