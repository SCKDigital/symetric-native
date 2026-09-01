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
import { buildChartCoordinates, computeDomainConnections, computeSleepConnections } from '@/lib/report/chart-coordinates';
import { buildContextConnectionsHtml } from '@/lib/report/page-context-connections-html';
import { buildDataQualityHtml } from '@/lib/report/page-data-quality-html';
import { buildPage1BodyHtml } from '@/lib/report/page1-html';
import { buildPage2Html } from '@/lib/report/page2-html';
import { buildReportDocument } from '@/lib/report/report-document';
import { computeWeeklyCompletion } from '@/lib/report/weekly-completion';
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
 * PDF report port (see project_rn_rewrite_scoping.md), mind-only. Chunk 4
 * adds the Context & Connections page (strongest day-of-week/time-of-day
 * bar charts, domain correlation table) — inserted as page 3, pushing
 * chunk 3's Data Quality & Methodology page back to page 4 (see the pages
 * array below; those two page builders were renamed by role rather than
 * position for exactly this reason, see page-data-quality-html.ts's
 * header comment). Domain connections/correlations are real now too
 * (detection/compute-connection.ts's significance-testing math, ported
 * this chunk), feeding both this page's table and a fuller Page 1
 * "Patterns detected" ranking. Renders each page as an HTML fragment and
 * assembles them via report-document.ts, then hands the whole document to
 * expo-print and opens the native share sheet — the RN equivalent of the
 * web version's auto-download anchor click (there's no browser download
 * folder on native to drop a file into). NOT ported yet: report name
 * field (uses profile.report_display_name / display_name / email
 * directly, no in-place edit), mind/body/cycle include toggles (mind is
 * the only option until body tracking exists), copy-as-markdown,
 * cycle-day computation, and persisted domain connections (the "held
 * steady across two windows" annotation on the connections table —
 * sourced from the weekly-cron domain_connections table, not ported).
 */
export async function generateReport(input: GenerateReportInput): Promise<{ uri: string }> {
  const { userId, userName, dateFrom, dateTo, clusters, appointmentId } = input;

  const [
    { data: checkIns },
    { data: allCheckIns },
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
    // Unfiltered by status (unlike checkIns above) — the weekly-completion
    // table on the Data Quality page needs to know how many were scheduled
    // vs. actually completed, which a status='completed'-only fetch can't
    // tell it.
    supabase.from('check_ins').select('*').eq('user_id', userId)
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
  const totalScheduled = (allCheckIns ?? []).length;
  const weeklyCompletion = computeWeeklyCompletion(allCheckIns ?? [], dateFrom, dateTo);

  const storedQuestions: PrepareQuestion[] = [...questions].sort((a, b) => a.sort_order - b.sort_order);

  const generationDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Page 2 — chart coordinates, sleep connections, sleep hours ────────────

  const coords = buildChartCoordinates(checkIns ?? [], sleepLogs ?? [], baselineMap, activeDomains, { from: dateFrom, to: dateTo }, markers);
  const sleepConnections = computeSleepConnections(coords.dates, coords.dailyMeans, coords.trackedDomains);
  const domainConnections = computeDomainConnections(coords.dates, coords.dailyMeans, coords.trackedDomains);
  const sleepHours = (sleepLogs ?? []).map(s => s.hours_slept).filter((v): v is number => v != null);
  const sleepMedianHours = sleepHours.length > 0 ? median(sleepHours) : null;

  // Fixed for now — no conditional pages (e.g. Body Overview) exist yet, so
  // the methodology page is always page 4. Revisit once a page's presence
  // becomes conditional, the way the web app's own methPageNum/totalPages
  // computation in SymetricReport.tsx accounts for hasBodyContent.
  const methodologyPageNum = 4;

  const page1Body = buildPage1BodyHtml({
    userName,
    dateFrom,
    dateTo,
    completedCheckIns,
    totalScheduled,
    trackedDomains: activeDomains,
    baselineMap,
    currentRollingMedians: coords.currentRollingMedians,
    questions: storedQuestions,
    flaggedClusters,
    domainConnections,
    lagRelationships,
    dayOfWeekPatterns,
    circadianPatterns: (circadianPatterns ?? []) as CircadianPattern[],
    rareEvents,
    patternEvolution,
    interventionImpacts,
    methodologyPageNum,
  });

  const page2Body = buildPage2Html({
    chartDomains: coords.chartDomains,
    baselineMap,
    currentRollingMedians: coords.currentRollingMedians,
    chartHasEnoughData: coords.chartHasEnoughData,
    chartMarkers: coords.chartMarkers,
    flaggedClusters,
    dates: coords.dates,
    interventionImpacts,
    rareEvents,
    patternEvolution,
    sleepConnections,
    sleepMedianHours,
    lagRelationships,
  });

  const contextConnectionsBody = buildContextConnectionsHtml({
    dayOfWeekPatterns,
    circadianPatterns: (circadianPatterns ?? []) as CircadianPattern[],
    domainConnections,
  });

  const dataQualityBody = buildDataQualityHtml({
    dateFrom,
    dateTo,
    weeklyCompletion,
    completedCheckIns,
    totalScheduled,
  });

  const html = buildReportDocument({
    pages: [
      { sectionTitle: 'Executive Summary', bodyHtml: page1Body },
      { sectionTitle: 'Mind Overview', bodyHtml: page2Body },
      { sectionTitle: 'Context & Connections', bodyHtml: contextConnectionsBody },
      { sectionTitle: 'Data Quality & Methodology', bodyHtml: dataQualityBody },
    ],
    generationDate,
    dateFrom,
    dateTo,
  });

  const { printToFileAsync } = await import('expo-print');
  const { uri } = await printToFileAsync({ html, base64: false });
  return { uri };
}
