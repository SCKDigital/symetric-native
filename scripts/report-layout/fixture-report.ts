// Assembles a realistic worst-case report document from fixtures, so its
// layout can be measured by a real engine instead of estimated by arithmetic.
import * as fs from 'fs';

import { buildReportDocument } from '@/lib/report/report-document';
import { buildPage1Pages } from '@/lib/report/page1-html';
import { buildPage2Pages, SPARKLINE_EXPLAINER_HTML } from '@/lib/report/page2-html';
import { layOutSparklines } from '@/lib/report/page2-findings-html';
import { buildSleepPages } from '@/lib/report/page-sleep-html';
import { buildBodyOverviewPages } from '@/lib/report/page-body-overview-html';
import { buildContextConnectionsPages } from '@/lib/report/page-context-connections-html';
import { buildDataQualityHtml, buildMethodologyHtml } from '@/lib/report/page-data-quality-html';
import { buildPeriodNotes, buildPeriodNotesSection } from '@/lib/report/period-notes';
import { buildCharacterEntries, buildCharacterPages } from '@/lib/report/symptom-character';
import { computeDomainTrends } from '@/lib/report/period-trend';
import { buildCheckedNotFoundSection, computeCheckedNotFound } from '@/lib/report/checked-not-found';
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
const dayRows = (domains: ChartDomain[]) => dates.map((date, k) => ({
  date, scores: Object.fromEntries(domains.map(cd => [cd.domain, cd.points[k].value ?? undefined])),
}));
const mindTrends = computeDomainTrends(dayRows([...mindDomains, chartDomain('sleep', 3)]), [...MIND, 'sleep']);
const bodyTrends = computeDomainTrends(dayRows(bodyDomains), BODY);

const clusters = Array.from({ length: 4 }, (_, i) => ({
  id: `c${i}`, user_id: 'u', start_date: dates[10 + i * 12], end_date: dates[14 + i * 12],
  ongoing: false, cluster_type: 'sustained_deviation', domains_involved: [MIND[i % MIND.length]],
  direction: 'depressed', severity_score: 3, enrichment_completed: true, created_at: dates[0],
})) as never[];

// Twelve markers, two pairs a day apart: the case that printed "2" and "3"
// on top of each other as "23".
const chartMarkers = [
  { dateIndex: 4, markerType: 'therapy', label: 'IFS Therapy' },
  { dateIndex: 12, markerType: 'medication', label: 'Increased to 40mg Fluoxitine' },
  { dateIndex: 13, markerType: 'life_event', label: 'Fainted with vomiting and diarrhoea at midnight' },
  { dateIndex: 25, markerType: 'therapy', label: 'IFS Therapy' },
  { dateIndex: 40, markerType: 'cycle_phase', label: 'Day 1' },
  { dateIndex: 46, markerType: 'therapy', label: 'IFS Therapy' },
  { dateIndex: 47, markerType: 'life_event', label: 'House sale fell through' },
  { dateIndex: 55, markerType: 'life_event', label: 'Family dinner' },
  { dateIndex: 60, markerType: 'medication', label: 'Started propranolol 10mg as needed' },
  { dateIndex: 67, markerType: 'therapy', label: 'IFS Therapy' },
  { dateIndex: 70, markerType: 'cycle_phase', label: 'Day 1' },
  { dateIndex: 88, markerType: 'therapy', label: 'IFS Therapy' },
] as never[];

const rareEvents = Array.from({ length: 9 }, (_, i) => ({
  event_type: 'extreme_spike', occurrence_dates: [dates[20 + i * 10]], frequency: 1,
  affected_domains: [MIND[i % MIND.length]],
  clinical_note: 'A long clinical note that wraps onto a second line in the report, describing what the detector observed and over how many days it observed it.',
})) as never[];

const patternEvolution = Array.from({ length: 8 }, (_, i) => ({
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
  chartDomains: mindDomains, baselineMap, trends: mindTrends,
  chartHasEnoughData: true, chartMarkers, dates,
  trailingHtml: SPARKLINE_EXPLAINER_HTML,
});

const characterRows = dates.slice(0, 70).map((entry_date, i) => ({
  entry_date, pain_mechanical: 4 + (i % 4), pain_widespread: 2,
  pain_character: ['aching', 'electric or shooting', 'burning'].slice(0, (i % 3) + 1),
  note: i % 3 === 0 ? 'Shoulder went again lifting the kettle, spent the afternoon flat with the curtains shut.' : null,
}));

const bodySparklines = layOutSparklines({
  chartDomains: bodyDomains, baselineMap, trends: bodyTrends,
  chartHasEnoughData: true, chartMarkers, dates,
  lineColor: '#8a5a20', isLowerBetterFn: () => true,
  trailingHtml: SPARKLINE_EXPLAINER_HTML,
});

const notesSection = buildPeriodNotesSection(buildPeriodNotes({
  checkIns: dates.slice(0, 60).map((d, i) => ({
    notes: i % 4 === 0
      ? 'Third night up with palpitations, missed work again and could not face the stairs by the afternoon. Rang the GP and could not get through, so spent most of the evening on the sofa with the lights off and the phone on silent, which helped a bit.'
      : 'Third night up with palpitations, missed work again and could not face the stairs by the afternoon.',
    scheduled_at: `${d}T09:00:00Z`, status: 'completed',
  })),
  bodyCheckIns: characterRows as never[],
  notableDates: [dates[10], dates[22]],
}));

const page1Input = {
      userName: 'Aisha Rahman', dateFrom, dateTo, completedCheckIns: 268, totalScheduled: 443,
      trackedDomains: MIND, baselineMap, trends: mindTrends, rangeLabel: 'Since Mind appointment on 8 August 2026 (Psychiatrist review)',
      questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, question_text: 'Is the fluoxetine dose change responsible for the improvement in joint instability, or is that the physio?', sort_order: i })) as never[],
      methodologyPageNum: 10,
      bodyTrackedDomains: BODY, bodyBaselineMap: baselineMap, bodyTrends,
      flaggedClusters: clusters, domainConnections, lagRelationships: [], dayOfWeekPatterns: [],
      circadianPatterns: [], rareEvents, patternEvolution, interventionImpacts,
      bodyFlaggedClusters: clusters, bodyPatternEvolution: patternEvolution, bodyRareEvents: rareEvents,
} as never;

const pages = [
  ...buildPage1Pages(page1Input).map(bodyHtml => ({ sectionTitle: 'Executive Summary', bodyHtml })),
  ...buildPage2Pages({
    notesSection, chartMarkers, flaggedClusters: clusters, dates,
    interventionImpacts, rareEvents, patternEvolution, sparklinesInline: mindSparklines.inline,
  } as never).map(bodyHtml => ({ sectionTitle: 'Mind Overview', bodyHtml })),
  ...mindSparklines.pages.map(bodyHtml => ({ sectionTitle: 'Mind Charts', bodyHtml })),
  ...buildSleepPages({
      qualityDomain: chartDomain('sleep', 3), dates, baselineMap, currentRollingMedians: medians, trends: mindTrends,
      chartMarkers,
      hoursPoints: dates.map((date, i) => ({ date, hours: i % 6 === 0 ? null : 6 + (i % 5) })),
      medianHours: 8,
      persistedConnections: [...MIND, ...BODY].map((domain, i) => ({
        id: `s${i}`, user_id: 'u', domain, affected_by_sleep: true,
        avg_after_good_sleep: 6.2, avg_after_poor_sleep: 4.1, difference: 2.1,
        sample_size: 40, good_sleep_count: 22, poor_sleep_count: 18,
        window_start: dateFrom, window_end: dateTo, detected_at: dateTo,
      })) as never[],
      fallbackConnections: [],
      hoursConnections: [...MIND, ...BODY].map(domain => ({
        domain, shortMean: 6.4, longMean: 4.2, difference: 2.2, shortDays: 24, longDays: 26,
        shortCutoff: 6.75, longCutoff: 8.25, nights: 75,
      })),
      // Saturated, as every other list here: the lag sentence sits under both
      // tables and is the line most likely to tip the page.
      lagRelationships: [{
        predictor: 'sleep', outcome: 'pain_mechanical', lagDays: 1, correlation: -0.6,
        instanceRate: 0.82, instanceCount: 41, totalPairs: 50,
      }],
    } as never).map(bodyHtml => ({ sectionTitle: 'Sleep', bodyHtml })),
  ...buildBodyOverviewPages({
      dateFrom,
      eventProximity: Array.from({ length: 6 }, (_, i) => ({
        markerDate: dates[12], markerType: 'medication', markerLabel: 'Increased to 40mg Fluoxitine',
        eventType: ['reaction', 'subluxation', 'presyncope', 'palpitations', 'reaction', 'subluxation'][i], before: 1, after: 5, change: 4, windowDays: 21,
      })) as never[],
      sparklinesInline: bodySparklines.inline,
      bodyEventOccurrences: Array.from({ length: 24 }, (_, i) => ({
        date: dates[89 - i * 3], eventType: 'reaction', label: 'Reaction', detail: 'flushing', context: 'Went out for lunch, hot room, felt it start in the face.',
      })) as never[],
      bodySiteFrequency: Array.from({ length: 14 }, (_, i) => ({
        region: 'shoulder', side: i % 2 ? 'R' : 'L', label: `${i % 2 ? 'R' : 'L'} shoulder`, dayCount: 30 - i * 2,
        source: 'pain', firstSeen: dates[(i * 6) % 80], lastSeen: dates[80],
      })) as never[],
      bodyFlaggedClusters: clusters, dates,
      bodyRareEvents: rareEvents, bodyPatternEvolution: patternEvolution,
    } as never).map(bodyHtml => ({ sectionTitle: 'Body Overview', bodyHtml })),
  ...bodySparklines.pages.map(bodyHtml => ({ sectionTitle: 'Body Charts', bodyHtml })),
  ...buildCharacterPages(buildCharacterEntries(characterRows)).map(bodyHtml => ({ sectionTitle: 'Symptom Character', bodyHtml })),
  ...buildContextConnectionsPages({
      grouping, dayOfWeekPatterns: [], circadianPatterns: [], domainConnections,
      cycleProximity: BODY.slice(0, 5).map(domain => ({
        domain, nearMean: 6.8, otherMean: 4.6, difference: 2.2, nearDays: 14, otherDays: 62, cycles: 2,
      })),
      preDayOne: BODY.slice(0, 5).map(domain => ({
        domain, nearMean: 7.1, otherMean: 4.4, difference: 2.7, nearDays: 21, otherDays: 60, cycles: 3,
      })),
      // Saturated: a 90-day report holds about three intervals; two unusual
      // ones add the footnote, which is the longest the line gets.
      cycleIntervals: [
        { start: dates[0], nextDayOne: dates[28], lengthDays: 28, usable: true },
        { start: dates[28], nextDayOne: dates[40], lengthDays: 12, usable: false },
        { start: dates[40], nextDayOne: dates[70], lengthDays: 30, usable: true },
        { start: dates[70], nextDayOne: dates[89], lengthDays: 52, usable: false },
      ],
      checkedNotFound: buildCheckedNotFoundSection(
        computeCheckedNotFound(dates, dailyMeans, MIND, new Set(['anxiety|concentration'])),
      ),
    } as never).map(bodyHtml => ({ sectionTitle: 'Context & Connections', bodyHtml })),
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
