import { buildDayScores } from '@/lib/day-scores';
import { detectInterventionImpacts } from '@/lib/detection/intervention-impact';
import { detectDayOfWeekPatterns } from '@/lib/detection/day-of-week-patterns';
import { detectLagRelationships } from '@/lib/detection/lag-relationships';
import { detectPatternEvolution } from '@/lib/detection/pattern-evolution';
import { detectRareEvents } from '@/lib/detection/rare-events';
import { rollingBodyBaseline } from '@/lib/detection/body-baseline';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import type { CircadianPattern } from '@/lib/circadian-detection';
import { resolveActiveDomains } from '@/lib/domains';
import { median } from '@/lib/baseline-stats';
import { calculateSortWeight } from '@/lib/priority-scoring';
import { isBodyDomain } from '@/lib/pattern-findings';
import { fetchQuestionsForAppointment } from '@/lib/api/questions';
import { fetchPatternReviewsForAppointment } from '@/lib/api/pattern-reviews';
import { buildBodyChartDomains, buildChartCoordinates, computeDomainConnections, computeSleepConnections } from '@/lib/report/chart-coordinates';
import { buildBodyOverviewHtml } from '@/lib/report/page-body-overview-html';
import { buildContextConnectionsHtml } from '@/lib/report/page-context-connections-html';
import { buildDataQualityHtml } from '@/lib/report/page-data-quality-html';
import { buildPage1BodyHtml } from '@/lib/report/page1-html';
import { buildPage2Html } from '@/lib/report/page2-html';
import { computeBodySiteFrequency, computeBodySummaries, buildBodyEventOccurrences } from '@/lib/report/body-summary';
import { buildReportDocument } from '@/lib/report/report-document';
import { computeWeeklyCompletion } from '@/lib/report/weekly-completion';
import { supabase } from '@/lib/supabase';
import type { BodyDomainType, DetectedCluster, PrepareQuestion } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

export interface GenerateReportInput {
  userId: string;
  userName?: string;
  dateFrom: string;
  dateTo: string;
  /** Unfiltered — every cluster (mind or body) in range, same as the web
   *  app's own `clusters` prop. Split into mind-only/body-only internally
   *  via isBodyDomain, matching web's mindClusters/bodyClusters split. */
  clusters: DetectedCluster[];
  appointmentId?: string;
  /** Gates the body_checkins/body_events/body_pain_sites fetches and the
   *  conditional Body Overview page. There's no report-level include-body
   *  toggle on native yet (see this file's own header comment), so the
   *  caller just passes profile.body_tracking_enabled straight through —
   *  the report includes body content whenever the user tracks it, same
   *  end result as the web app's default (includeBody defaults false only
   *  because web's caller has its own opt-in checkbox to thread through). */
  bodyTrackingEnabled?: boolean;
}

// Mirrors insights.tsx's buildBodyDays/bodyBaselineMap recipe, but scoped to
// the report's own date-range rows (bodyCheckIns) rather than a separate
// 90-day lookback — consistent with how the mind-side detectors in this
// file already only see the report's own checkIns/sleepLogs range. Ported
// from the web app's generateReport.ts's buildBodyDayScores, unchanged.
function buildBodyDayScores(rows: Record<string, unknown>[], domains: BodyDomainType[]): { date: string; scores: Partial<Record<BodyDomainType, number>> }[] {
  return rows
    .map(entry => {
      const scores: Partial<Record<BodyDomainType, number>> = {};
      for (const d of domains) {
        const v = dailyBodyValue(entry, d);
        if (v !== null) scores[d] = v;
      }
      return { date: entry.entry_date as string, scores };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
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
 * directly, no in-place edit), a mind/body/cycle include-toggle UI (body
 * content is included automatically whenever bodyTrackingEnabled is
 * passed true — see GenerateReportInput's own comment), copy-as-markdown,
 * cycle-day computation, and persisted domain connections (the "held
 * steady across two windows" annotation on the connections table —
 * sourced from the weekly-cron domain_connections table, not ported).
 *
 * Body Overview (a later pass, after body tracking + its own Insights
 * detector sub-series both shipped): a third page, inserted between Mind
 * Overview and Context & Connections whenever there's body content in
 * range (hasBodyContent below, mirroring the web app's SymetricReport.tsx
 * gate) — domain sparklines, a dated event table, a ranked pain/instability
 * site list, and body-only rare-event/pattern-evolution detection, reusing
 * page2-findings-html.ts's already-generic section builders. flaggedClusters
 * IS correctly split into mind-only/body-only (previously unfiltered — see
 * the split below), fixing a latent bug where a flagged body cluster could
 * have leaked into the mind-only Page 1/Page 2 sections with an unlabelled
 * domain key.
 *
 * Mind+body day-score merge (a still-later pass, after insights.tsx's own
 * merge shipped): deliberately NOT mirrored here. insights.tsx could merge
 * day-of-week/lag-relationship/intervention-impact detection safely because
 * pattern-findings.ts's finding functions already split results by area
 * (`.areas.includes('mind'|'body')`) before they reach any UI. This file's
 * Page 1 ranking (report-findings.ts's buildUnifiedFindings) has no such
 * split — it dumps dayOfWeekPatterns/lagRelationships/interventionImpacts
 * straight into one ranked list with no domain-type filter. Merging body
 * domains into those inputs here would leak body-domain findings into
 * Page 1's "Mind domain summary" section unlabelled — worse than the
 * current mind-only state, not better. Giving Page 1 real body-awareness
 * needs report-findings.ts to gain the same area-split pattern-findings.ts
 * already has, which is its own separate piece of work, not a mechanical
 * copy of insights.tsx's merge.
 */
export async function generateReport(input: GenerateReportInput): Promise<{ uri: string }> {
  const { userId, userName, dateFrom, dateTo, clusters, appointmentId, bodyTrackingEnabled = false } = input;

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
    { data: bodyCheckInsRaw },
    { data: bodyEventsRaw },
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
    bodyTrackingEnabled
      ? supabase.from('body_checkins').select('*').eq('user_id', userId).gte('entry_date', dateFrom).lte('entry_date', dateTo).order('entry_date', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    bodyTrackingEnabled
      ? supabase.from('body_events').select('*, body_event_sites(*)').eq('user_id', userId).gte('event_date', dateFrom).lte('event_date', dateTo)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // body_pain_sites has no date column of its own (only body_checkin_id) —
  // fetch it as a follow-up query keyed off the check-ins already fetched,
  // then join entry_date on locally. The ranked site-frequency list needs a
  // date per site to count distinct days. Ported from the web app's
  // GenerateReportSection.tsx, unchanged.
  const bodyCheckInIds = (bodyCheckInsRaw ?? []).map(c => c.id as string);
  const { data: bodyPainSitesRaw } = bodyTrackingEnabled && bodyCheckInIds.length > 0
    ? await supabase.from('body_pain_sites').select('*').in('body_checkin_id', bodyCheckInIds)
    : { data: [] as Record<string, unknown>[] };
  const entryDateByCheckInId = new Map((bodyCheckInsRaw ?? []).map(c => [c.id as string, c.entry_date as string]));
  const bodyPainSites = (bodyPainSitesRaw ?? []).map(site => ({ ...site, entry_date: entryDateByCheckInId.get(site.body_checkin_id as string) })) as any[];

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
  const flagFilter = (c: DetectedCluster) => c.flagged_for_report === true || reviewMap[c.id]?.should_discuss === true;
  // `clusters` mixes mind- and body-domain rows indiscriminately (see
  // fetchClustersForDateRange) — split by domain before filtering so a
  // body-domain cluster the patient marked "should discuss" can never leak
  // into the mind-only flaggedClusters list with an unlabelled domain key.
  const mindClusters = clusters.filter(c => !isBodyDomain((c.domains_involved ?? [])[0] ?? ''));
  const bodyClustersRaw = bodyTrackingEnabled ? clusters.filter(c => isBodyDomain((c.domains_involved ?? [])[0] ?? '')) : [];
  const flaggedClusters = mindClusters.filter(flagFilter).sort((a, b) => sortWeight(b) - sortWeight(a));
  const bodyFlaggedClusters = bodyClustersRaw.filter(flagFilter).sort((a, b) => sortWeight(b) - sortWeight(a));

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

  // ── Body tracking ──────────────────────────────────────────────────────
  // Scoped to the report's own date-range rows, same as every mind-side
  // detector call above — not a separate 90-day lookback, matching the web
  // app's own generateReport.ts comment on this exact choice.

  const bodySummary = computeBodySummaries(bodyCheckInsRaw ?? [], bodyEventsRaw ?? []);
  const bodyTrackedDomains = bodySummary.domains.map(d => d.domain) as BodyDomainType[];
  const bodyDayScores = buildBodyDayScores(bodyCheckInsRaw ?? [], bodyTrackedDomains);

  const bodyBaselineMap: Record<string, number> = {};
  for (const d of bodyTrackedDomains) {
    const history = bodyDayScores.map(bd => bd.scores[d]).filter((v): v is number => v !== undefined);
    bodyBaselineMap[d] = rollingBodyBaseline(history);
  }

  const bodyPatternEvolution = detectPatternEvolution(bodyDayScores, bodyTrackedDomains, bodyBaselineMap);
  const bodyRareEvents = detectRareEvents(bodyDayScores, bodyTrackedDomains, bodyBaselineMap);
  // Not computed this pass: detectBodyTimeOfDayPatterns/detectBodyEventFrequency/
  // detectBodyEventImpacts. On the web app these three only ever feed Page 1's
  // unified findings ranking (reportFindings.tsx's allFindings) — Page 3 itself
  // never renders them directly. Page 1 stays mind-only this pass (see this
  // file's header comment), so there's nothing yet to consume their output;
  // add them back alongside whichever chunk gives Page 1 body-awareness.

  const bodyCurrentRollingMedians: Record<string, number> = {};
  for (const domain of bodyTrackedDomains) {
    const vals = bodyDayScores.map(bd => bd.scores[domain]).filter((v): v is number => v != null);
    if (vals.length > 0) bodyCurrentRollingMedians[domain] = median(vals);
  }
  const bodyChartDomains = buildBodyChartDomains(bodyDayScores as any, bodyTrackedDomains, coords.dates, bodyBaselineMap);
  const bodyChartHasEnoughData = coords.dates.length >= 7 && bodyChartDomains.some(cd => cd.points.filter(p => p.value != null).length >= 7);

  const bodyEventOccurrences = buildBodyEventOccurrences(bodyEventsRaw as any ?? [], bodyCheckInsRaw ?? []);
  const bodySiteFrequency = computeBodySiteFrequency(bodyPainSites, bodyEventsRaw as any ?? []);

  const hasBodyContent = bodySummary.domains.length > 0 || bodySummary.events.length > 0;

  // Page count/numbering shifts by one whenever Body Overview is present,
  // mirroring the web app's SymetricReport.tsx hasBodyContent-aware
  // methPageNum/totalPages computation. buildReportDocument derives
  // totalPages from pages.length itself, so only methodologyPageNum (used
  // by Page 1's "Methodology on page N" footnote) needs computing here.
  const methodologyPageNum = hasBodyContent ? 5 : 4;

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

  const bodyOverviewBody = hasBodyContent ? buildBodyOverviewHtml({
    bodyChartDomains,
    bodyBaselineMap,
    bodyCurrentRollingMedians,
    bodyChartHasEnoughData,
    bodyEventOccurrences,
    bodySiteFrequency,
    bodyFlaggedClusters,
    chartMarkers: coords.chartMarkers,
    dates: coords.dates,
    interventionImpacts,
    bodyRareEvents,
    bodyPatternEvolution,
  }) : null;

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
      ...(bodyOverviewBody != null ? [{ sectionTitle: 'Body Overview', bodyHtml: bodyOverviewBody }] : []),
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
