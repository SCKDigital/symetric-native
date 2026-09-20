// Assembles a realistic worst-case report document from fixtures, so its
// layout can be measured by a real engine instead of estimated by arithmetic.
import * as fs from 'fs';

import { buildReportDocument } from '@/lib/report/report-document';
import { buildDomainSummaryHtml, buildPage1BodyHtml } from '@/lib/report/page1-html';
import { buildPage2Html, SPARKLINE_EXPLAINER_HTML } from '@/lib/report/page2-html';
import { layOutSparklines } from '@/lib/report/page2-findings-html';
import { buildSleepPageHtml } from '@/lib/report/page-sleep-html';
import { buildBodyOverviewHtml } from '@/lib/report/page-body-overview-html';
import { buildContextConnectionsHtml } from '@/lib/report/page-context-connections-html';
import { buildDataQualityHtml, buildMethodologyHtml } from '@/lib/report/page-data-quality-html';
import { buildPeriodNotes, buildPeriodNotesHtml } from '@/lib/report/period-notes';
import { buildCharacterEntries, buildCharacterSectionHtml } from '@/lib/report/symptom-character';
import { buildCheckedNotFoundHtml, computeCheckedNotFound } from '@/lib/report/checked-not-found';
import { groupConnections, type ConnectionRow } from '@/lib/correlation-groups';
import type { ChartDomain } from '@/lib/report/chart-coordinates';

const N = 90;
function mkDates(n: number, start = '2026-06-23'): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T12:00:00Z');
  for (let i = 0; i < n; i++) out.push(new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10));
  return out;
}
const dates = mkDates(N);
const dateFrom = dates[0];
const dateTo = dates[N - 1];

const MIND = ['anxiety', 'concentration', 'energy', 'irritability', 'mood', 'motivation', 'sensory_sensitivity', 'social_battery'];
const BODY = ['fatigue', 'pain_mechanical', 'pain_widespread', 'joint_instability', 'breathlessness', 'orthostatic', 'gut', 'brain_fog', 'exhaustion'];

const chartDomain = (domain: string, i: number): ChartDomain => ({
  domain,
  points: dates.map((date, k) => ({ date, value: k % 7 === i % 7 ? null : 4 + 2 * Math.sin(k / 5 + i) })),
  baseline: 5, dashPattern: '', observedMin: 1, observedMax: 10,
} as unknown as ChartDomain);

const mindDomains = MIND.map(chartDomain);
const bodyDomains = BODY.map(chartDomain);
const baselineMap = Object.fromEntries([...MIND, ...BODY, 'sleep'].map(d => [d, 5]));
const medians = Object.fromEntries([...MIND, ...BODY, 'sleep'].map(d => [d, 5.4]));

const clusters = Array.from({ length: 4 }, (_, i) => ({
  id: `c${i}`, user_id: 'u', start_date: dates[10 + i * 12], end_date: dates[14 + i * 12],
  ongoing: false, cluster_type: 'sustained_deviation', domains_involved: [MIND[i % MIND.length]],
  direction: 'depressed', severity_score: 3, enrichment_completed: true, created_at: dates[0],
})) as never[];

const chartMarkers = [
  { dateIndex: 12, markerType: 'medication', label: 'Increased to 40mg Fluoxitine' },
  { dateIndex: 40, markerType: 'cycle_phase', label: 'Day 1' },
  { dateIndex: 55, markerType: 'life_event', label: 'Family dinner' },
  { dateIndex: 70, markerType: 'cycle_phase', label: 'Day 1' },
] as never[];

const rareEvents = Array.from({ length: 4 }, (_, i) => ({
  event_type: 'extreme_spike', occurrence_dates: [dates[20 + i * 10]], frequency: 1,
  affected_domains: [MIND[i % MIND.length]],
  clinical_note: 'A long clinical note that wraps onto a second line in the report, describing what the detector observed and over how many days it observed it.',
})) as never[];

const patternEvolution = Array.from({ length: 3 }, (_, i) => ({
  domain: MIND[i], evolution_type: 'volatility_change', direction: 'worsening',
  first_period_avg: 4.2, recent_period_avg: 5.6, change_magnitude: 1.4,
  first_period_volatility: 0.68, recent_period_volatility: 1.51,
  first_period_stability: 0.8, recent_period_stability: 0.5,
  first_period_start: dates[0], first_period_end: dates[29],
  recent_period_start: dates[60], recent_period_end: dates[89],
})) as never[];

const interventionImpacts = Array.from({ length: 3 }, (_, i) => ({
  marker_id: `m${i}`, marker_date: dates[12], marker_type: 'medication',
  marker_label: 'Increased to 40mg Fluoxitine',
  affected_domains: [{ domain: BODY[i], before_avg: 5.2, after_avg: 3.4, change: -1.8, direction: 'decreased', window_days: 21 }],
  data_quality: 'solid', before_day_count: 20, after_day_count: 21,
})) as never[];

const connectionRows: ConnectionRow[] = [];
for (let i = 0; i < MIND.length - 1; i++) {
  connectionRows.push({ domain_a: MIND[i], domain_b: MIND[i + 1], moves_together: true, strength: 0.6 + i * 0.02, sample_size: 20 + i, window_end: dateTo });
}
for (let i = 0; i < 4; i++) {
  connectionRows.push({ domain_a: MIND[i], domain_b: BODY[i], moves_together: false, strength: 0.7, sample_size: 18, window_end: dateTo });
}
const grouping = groupConnections(connectionRows);

const dailyMeans: Record<string, Record<string, number | null>> = {};
dates.forEach((d, i) => {
  dailyMeans[d] = {};
  for (const m of MIND) dailyMeans[d][m] = i % 5 === 0 ? null : 4 + (i % 4);
});

const domainConnections = MIND.slice(0, 3).map((a, i) => ({ domainA: a, domainB: MIND[i + 1], direction: 'positive' as const, n: 60 }));

const mindSparklines = layOutSparklines({
  chartDomains: mindDomains, baselineMap, currentRollingMedians: medians,
  chartHasEnoughData: true, chartMarkers, flaggedClusters: clusters, dates,
  trailingHtml: SPARKLINE_EXPLAINER_HTML,
});

const characterRows = dates.slice(0, 30).map((entry_date, i) => ({
  entry_date, pain_mechanical: 4 + (i % 4), pain_widespread: 2,
  pain_character: ['aching', 'electric or shooting', 'burning'].slice(0, (i % 3) + 1),
  note: i % 3 === 0 ? 'Shoulder went again lifting the kettle, spent the afternoon flat with the curtains shut.' : null,
}));

const bodySparklines = layOutSparklines({
  chartDomains: bodyDomains, baselineMap, currentRollingMedians: medians,
  chartHasEnoughData: true, chartMarkers, flaggedClusters: clusters, dates,
  lineColor: '#8a5a20', isLowerBetterFn: () => true,
  trailingHtml: SPARKLINE_EXPLAINER_HTML,
});

const notesHtml = buildPeriodNotesHtml(buildPeriodNotes({
  checkIns: dates.slice(0, 40).map(d => ({
    notes: 'Third night up with palpitations, missed work again and could not face the stairs by the afternoon.',
    scheduled_at: `${d}T09:00:00Z`, status: 'completed',
  })),
  bodyCheckIns: characterRows as never[],
  notableDates: [dates[10], dates[22]],
}));

const page1Input = {
      userName: 'Aisha Rahman', dateFrom, dateTo, completedCheckIns: 268, totalScheduled: 443,
      trackedDomains: MIND, baselineMap, currentRollingMedians: medians,
      questions: Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, question_text: 'Is the fluoxetine dose change responsible for the improvement in joint instability, or is that the physio?', sort_order: i })) as never[],
      methodologyPageNum: 10,
      bodyTrackedDomains: BODY, bodyBaselineMap: baselineMap, bodyCurrentRollingMedians: medians,
      flaggedClusters: clusters, domainConnections, lagRelationships: [], dayOfWeekPatterns: [],
      circadianPatterns: [], rareEvents, patternEvolution, interventionImpacts,
      bodyFlaggedClusters: clusters, bodyPatternEvolution: patternEvolution, bodyRareEvents: rareEvents,
} as never;

const pages = [
  { sectionTitle: 'Executive Summary', bodyHtml: buildPage1BodyHtml(page1Input) },
  { sectionTitle: 'Domain Summary', bodyHtml: buildDomainSummaryHtml(page1Input) },
  {
    sectionTitle: 'Mind Overview',
    bodyHtml: buildPage2Html({
      notesHtml, chartMarkers, flaggedClusters: clusters, dates,
      interventionImpacts, rareEvents, patternEvolution, sparklinesInline: mindSparklines.inline,
    } as never),
  },
  ...mindSparklines.pages.map(bodyHtml => ({ sectionTitle: 'Mind Charts', bodyHtml })),
  {
    sectionTitle: 'Sleep',
    bodyHtml: buildSleepPageHtml({
      qualityDomain: chartDomain('sleep', 3), dates, baselineMap, currentRollingMedians: medians,
      chartMarkers, flaggedClusters: clusters,
      hoursPoints: dates.map((date, i) => ({ date, hours: i % 6 === 0 ? null : 6 + (i % 5) })),
      medianHours: 8,
      persistedConnections: MIND.slice(0, 5).map((domain, i) => ({
        id: `s${i}`, user_id: 'u', domain, affected_by_sleep: true,
        avg_after_good_sleep: 6.2, avg_after_poor_sleep: 4.1, difference: 2.1,
        sample_size: 40, good_sleep_count: 22, poor_sleep_count: 18,
        window_start: dateFrom, window_end: dateTo, detected_at: dateTo,
      })) as never[],
      fallbackConnections: [], lagRelationships: [],
    } as never),
  },
  {
    sectionTitle: 'Body Overview',
    bodyHtml: buildBodyOverviewHtml({
      dateFrom,
      eventProximity: Array.from({ length: 4 }, (_, i) => ({
        markerDate: dates[12], markerType: 'medication', markerLabel: 'Increased to 40mg Fluoxitine',
        eventType: ['reaction', 'subluxation', 'presyncope', 'palpitations'][i], before: 1, after: 5, change: 4, windowDays: 21,
      })) as never[],
      sparklinesInline: bodySparklines.inline,
      bodyEventOccurrences: Array.from({ length: 4 }, (_, i) => ({
        date: dates[30 + i], eventType: 'reaction', label: 'Reaction', detail: 'flushing', context: 'Went out for lunch, hot room, felt it start in the face.',
      })) as never[],
      bodySiteFrequency: Array.from({ length: 5 }, (_, i) => ({
        region: 'shoulder', side: i % 2 ? 'R' : 'L', label: `${i % 2 ? 'R' : 'L'} shoulder`, dayCount: 22 - i * 3,
        source: 'pain', firstSeen: dates[i * 10], lastSeen: dates[80],
      })) as never[],
      bodyFlaggedClusters: clusters, chartMarkers, dates, interventionImpacts,
      bodyRareEvents: rareEvents, bodyPatternEvolution: patternEvolution,
    } as never),
  },
  ...bodySparklines.pages.map(bodyHtml => ({ sectionTitle: 'Body Charts', bodyHtml })),
  { sectionTitle: 'Symptom Character', bodyHtml: buildCharacterSectionHtml(buildCharacterEntries(characterRows)) },
  {
    sectionTitle: 'Context & Connections',
    bodyHtml: buildContextConnectionsHtml({
      grouping, dayOfWeekPatterns: [], circadianPatterns: [], domainConnections,
      cycleProximity: BODY.slice(0, 5).map(domain => ({
        domain, nearMean: 6.8, otherMean: 4.6, difference: 2.2, nearDays: 14, otherDays: 62, cycles: 2,
      })),
      checkedNotFoundHtml: buildCheckedNotFoundHtml(
        computeCheckedNotFound(dates, dailyMeans, MIND, new Set(['anxiety|concentration'])),
      ),
    } as never),
  },
  {
    sectionTitle: 'Data Quality',
    bodyHtml: buildDataQualityHtml({
      dateFrom, dateTo, completedCheckIns: 268, totalScheduled: 443,
      weeklyCompletion: Array.from({ length: 13 }, (_, i) => ({
        weekStart: dates[i * 7], scheduled: 45, completed: 28 + (i % 10), pct: 62 + (i % 10), oneTap: i % 4,
      })),
      oneTap: { completed: 268, oneTap: 61, share: 61 / 268 },
      missed: {
        missed: 175, scheduled: 443,
        byBlock: {
          morning: { missed: 95, scheduled: 130 }, midday: { missed: 30, scheduled: 105 },
          afternoon: { missed: 28, scheduled: 104 }, evening: { missed: 22, scheduled: 104 },
        },
        standout: { block: 'morning', missed: 95, missRate: 95 / 130 },
      },
    } as never),
  },
  { sectionTitle: 'Methodology', bodyHtml: buildMethodologyHtml(dateFrom, dateTo) },
];

const html = buildReportDocument({ pages, generationDate: '20 September 2026', dateFrom, dateTo });
fs.writeFileSync(process.argv[2], html);
console.log(`wrote ${pages.length} logical pages, ${html.length} bytes`);
pages.forEach((p, i) => console.log(`  ${i + 1}. ${p.sectionTitle}`));
