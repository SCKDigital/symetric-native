import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { buildEpisodeTimelineHtml, buildRareEventsSectionHtml } from '@/lib/report/page2-findings-html';
import type { ChartMarker, SleepConnection } from '@/lib/report/chart-coordinates';
import { renderHoursSleptSvg, summariseHoursSlept, type HoursSleptPoint } from '@/lib/report/hours-slept-svg';
import { DOMAIN_LABELS } from '@/lib/report/theme';
import type { DetectedCluster } from '@/lib/supabase';

interface Page2Data {
  baselineMap: Record<string, number>;
  currentRollingMedians: Record<string, number>;
  chartMarkers: ChartMarker[];
  flaggedClusters: DetectedCluster[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
  rareEvents: RareEvent[];
  patternEvolution: PatternEvolution[];
  sleepConnections: SleepConnection[];
  sleepMedianHours: number | null;
  /** One entry per date in the report range, gaps included — see
   *  hours-slept-svg.ts. Duration is charted separately from the quality
   *  score above it because they are different measurements on different
   *  scales, and a median alone says nothing about consistency. */
  sleepHoursPoints: HoursSleptPoint[];
  lagRelationships: LagRelationship[];
  /** Whatever layOutSparklines left for this page — in practice the "fewer
   *  than 7 days" note, since the charts themselves now get their own pages
   *  rather than overflowing this one. */
  sparklinesInline: string;
}

function fmtVal(v: number | undefined): string {
  return v != null ? (Math.round(v * 10) / 10).toFixed(1) : '-';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Ported from the web app's Page2Patterns.tsx ("Mind Overview") — the body
// content only (no <html>/<style> wrapper, that's shared across every page
// by report-document.ts). See that file's own header comment for the
// overall HTML-instead-of-component-tree approach this report uses.
export function buildPage2Html(data: Page2Data): string {
  const {
    chartMarkers, flaggedClusters, dates, interventionImpacts,
    rareEvents, patternEvolution, sleepConnections, sleepMedianHours, sleepHoursPoints,
    lagRelationships, baselineMap, currentRollingMedians, sparklinesInline,
  } = data;

  const sleepBaseline = baselineMap['sleep'] ?? 3;
  const sleepCurrent = currentRollingMedians['sleep'];
  const hasSleepData = sleepCurrent != null;
  const sleepDeviating = sleepCurrent != null && Math.abs(sleepCurrent - sleepBaseline) >= 0.5;
  const sleepLagNote = lagRelationships.find(r => r.predictor === 'sleep');

  const sleepDeviationSuffix = sleepDeviating ? (sleepCurrent! < sleepBaseline ? ' - below baseline' : ' - above baseline') : '';

  const sleepHoursRow = sleepMedianHours != null
    ? `<div class="sleep-row"><span class="sleep-label">Median hours slept</span><span class="sleep-value">${fmtVal(sleepMedianHours)} hours</span></div>`
    : '';

  // Duration gets its own chart, under the quality figures rather than mixed
  // into them: the sleep score above is a 1-5 rating, this is a count of
  // hours, and the two answer different questions.
  const hoursSummary = summariseHoursSlept(sleepHoursPoints);
  const hoursSvg = sleepMedianHours != null ? renderHoursSleptSvg(sleepHoursPoints, sleepMedianHours) : '';
  const sleepHoursChart = hoursSvg && hoursSummary
    ? `<div class="sleep-chart">
        <p class="sleep-chart-title">Hours slept per night</p>
        ${hoursSvg}
        <p class="sleep-chart-caption">${hoursSummary.nights} night${hoursSummary.nights !== 1 ? 's' : ''} with a duration recorded &middot; shortest ${fmtVal(hoursSummary.min)} h, longest ${fmtVal(hoursSummary.max)} h &middot; dashed line is this patient's own median. Gaps are nights not logged.</p>
      </div>`
    : sleepMedianHours == null && hasSleepData
      ? `<p class="empty-muted">Sleep quality was rated but no durations were recorded in this period.</p>`
      : '';

  const sleepConnectionsRow = sleepConnections.length > 0
    ? `<div class="sleep-row"><span class="sleep-label">Domain relationships</span><span class="sleep-value">${esc(sleepConnections.map(c => `${DOMAIN_LABELS[c.domain] ?? c.domain}: ${c.observation}`).join(' · '))}</span></div>`
    : '';

  const sleepLagHtml = sleepLagNote
    ? `<p class="sleep-note">Sleep is implicated in a lag relationship: ${esc(DOMAIN_LABELS[sleepLagNote.predictor as string] ?? sleepLagNote.predictor)} predicts ${esc(DOMAIN_LABELS[sleepLagNote.outcome as string] ?? sleepLagNote.outcome)} ${sleepLagNote.lagDays} day${sleepLagNote.lagDays !== 1 ? 's' : ''} later (${Math.round(sleepLagNote.instanceRate * 100)}% of occasions).</p>`
    : '';

  const noSleepDataHtml = !hasSleepData ? `<p class="empty-muted">Sleep not tracked in this period.</p>` : '';

  return `
    <div class="section-gap">
      <p class="section-label">Sleep</p>
      <div class="sleep-row">
        <span class="sleep-label">Average sleep score</span>
        <span class="sleep-value">${sleepCurrent != null ? fmtVal(sleepCurrent) : '-'} / 5 (personal baseline: ${fmtVal(sleepBaseline)})${sleepDeviationSuffix}</span>
      </div>
      ${sleepHoursRow}
      ${sleepHoursChart}
      ${sleepConnectionsRow}
      ${sleepLagHtml}
      ${noSleepDataHtml}
    </div>

    ${sparklinesInline}

    ${buildEpisodeTimelineHtml({ clusters: flaggedClusters, chartMarkers, dates, interventionImpacts, showMarkerNumbers: true })}

    ${buildRareEventsSectionHtml(rareEvents, patternEvolution)}
  `;
}

/** Follows the sparklines onto whichever page they end up on — see
 *  layOutSparklines. It explains the grey band those charts are drawn with,
 *  so it is worth nothing on a page that has no charts on it. */
export const SPARKLINE_EXPLAINER_HTML = `
    <div class="explainer-box">
      <p class="explainer-title">Reading these charts</p>
      <p class="explainer-text">Grey = within personal baseline, not "fine" in an absolute sense: a score typical for this individual can still look high or low on a standard scale.</p>
    </div>`;
