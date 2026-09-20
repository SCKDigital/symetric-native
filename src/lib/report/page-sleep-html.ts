import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { SleepSymptomConnection } from '@/lib/queries/sleep-connections';
import type { ChartDomain, ChartMarker, SleepConnection } from '@/lib/report/chart-coordinates';
import { renderHoursSleptSvg, summariseHoursSlept, type HoursSleptPoint } from '@/lib/report/hours-slept-svg';
import { buildDomainSparklineSectionHtml } from '@/lib/report/page2-findings-html';
import { DOMAIN_LABELS } from '@/lib/report/theme';
import type { DetectedCluster } from '@/lib/supabase';

// Sleep's own page.
//
// It used to be four text rows at the top of Mind Overview: an average score,
// a median hours figure, a one-line relationship summary. Two measurements on
// two scales, each reduced to a single number, on a page about something else.
// Neither could show a run of bad nights, and the median actively hid the
// thing a clinician asks about first — whether the nights are consistent.
// Sleep quality was never charted at all: buildChartCoordinates picks its
// series from the mind DOMAIN_ORDER, which has no `sleep` in it, so months of
// recorded quality had nowhere to appear.
//
// Both series are now drawn day by day, over the same date axis as every
// other chart in the report, with the relationships that depend on them on
// the same page rather than three pages away.

interface SleepPageData {
  /** Quality, 1-5, as a chartable series — null when nothing was rated. */
  qualityDomain: ChartDomain | null;
  dates: string[];
  baselineMap: Record<string, number>;
  currentRollingMedians: Record<string, number>;
  chartMarkers: ChartMarker[];
  flaggedClusters: DetectedCluster[];
  /** One entry per date in range, gaps included. */
  hoursPoints: HoursSleptPoint[];
  medianHours: number | null;
  /** The detector's own persisted good-vs-poor-sleep comparison, when a
   *  window overlapping this range has been computed. */
  persistedConnections: SleepSymptomConnection[];
  /** The in-report fallback: a plain mean split, no significance testing. */
  fallbackConnections: SleepConnection[];
  lagRelationships: LagRelationship[];
}

function fmtVal(v: number | null | undefined): string {
  return v != null ? (Math.round(v * 10) / 10).toFixed(1) : '-';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function label(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

export function buildSleepPageHtml(data: SleepPageData): string {
  const {
    qualityDomain, dates, baselineMap, currentRollingMedians, chartMarkers, flaggedClusters,
    hoursPoints, medianHours, persistedConnections, fallbackConnections, lagRelationships,
  } = data;

  const sleepBaseline = baselineMap['sleep'] ?? 3;
  const sleepCurrent = currentRollingMedians['sleep'];
  const deviating = sleepCurrent != null && Math.abs(sleepCurrent - sleepBaseline) >= 0.5;
  const deviationSuffix = deviating ? (sleepCurrent! < sleepBaseline ? ' - below baseline' : ' - above baseline') : '';

  // ── Quality ───────────────────────────────────────────────────────────────
  const qualityChart = qualityDomain
    ? buildDomainSparklineSectionHtml({
      chartDomains: [qualityDomain],
      baselineMap,
      currentRollingMedians,
      chartHasEnoughData: true,
      chartMarkers,
      flaggedClusters,
      dates,
      label: 'Sleep quality, rated 1-5 each morning',
    })
    : `<div class="section-gap"><p class="section-label">Sleep quality</p><p class="empty-muted">No sleep quality ratings in this period.</p></div>`;

  const qualitySummary = sleepCurrent != null
    ? `<p class="sleep-note">Median rating ${fmtVal(sleepCurrent)} / 5 against a personal baseline of ${fmtVal(sleepBaseline)}${deviationSuffix}.</p>`
    : '';

  // ── Duration ──────────────────────────────────────────────────────────────
  const hoursSummary = summariseHoursSlept(hoursPoints);
  const hoursSvg = medianHours != null ? renderHoursSleptSvg(hoursPoints, medianHours) : '';
  const hoursSection = hoursSvg && hoursSummary
    ? `<div class="section-gap">
        <p class="section-label">Hours slept per night</p>
        <div class="sleep-chart">
          ${hoursSvg}
          <p class="sleep-chart-caption">${hoursSummary.nights} of ${hoursPoints.length} nights have a duration recorded &middot; shortest ${fmtVal(hoursSummary.min)} h, longest ${fmtVal(hoursSummary.max)} h &middot; gaps are nights not logged.</p>
        </div>
      </div>`
    : `<div class="section-gap"><p class="section-label">Hours slept per night</p><p class="empty-muted">No sleep durations recorded in this period.</p></div>`;

  // ── Relationships ─────────────────────────────────────────────────────────
  // The persisted detector is preferred: it compares each domain's mean after
  // good nights against poor ones on a stated sample, which a clinician can
  // weigh. The in-report fallback is a bare mean split with no sample size,
  // worth showing only when the detector has not run over this range.
  const connectionsSection = persistedConnections.length > 0
    ? `<div class="section-gap">
        <p class="section-label">What follows a poor night</p>
        <table class="domain-table">
          <thead><tr>
            <th>Domain</th>
            <th class="center">After good sleep</th>
            <th class="center">After poor sleep</th>
            <th class="center">Difference</th>
            <th class="center">Nights</th>
          </tr></thead>
          <tbody>
            ${persistedConnections.map(c => `<tr>
              <td>${esc(label(c.domain))}</td>
              <td class="center">${fmtVal(c.avg_after_good_sleep)}</td>
              <td class="center">${fmtVal(c.avg_after_poor_sleep)}</td>
              <td class="center">${c.difference > 0 ? '+' : ''}${fmtVal(c.difference)}</td>
              <td class="center">${c.good_sleep_count}/${c.poor_sleep_count}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="sleep-chart-caption">Nights column is good/poor nights compared. A difference is a mean gap, not a test of cause.</p>
      </div>`
    : fallbackConnections.length > 0
      ? `<div class="section-gap">
          <p class="section-label">What follows a poor night</p>
          ${fallbackConnections.map(c => `<div class="sleep-row"><span class="sleep-label">${esc(label(c.domain))}</span><span class="sleep-value">${esc(c.observation)}</span></div>`).join('')}
          <p class="sleep-chart-caption">A mean split between nights rated 2 or below and those above 3, computed for this report. No sample-size test.</p>
        </div>`
      : '';

  const sleepLag = lagRelationships.find(r => r.predictor === 'sleep');
  const lagHtml = sleepLag
    ? `<p class="sleep-note">Lag relationship: ${esc(label(sleepLag.predictor as string))} predicts ${esc(label(sleepLag.outcome as string))} ${sleepLag.lagDays} day${sleepLag.lagDays !== 1 ? 's' : ''} later, on ${Math.round(sleepLag.instanceRate * 100)}% of occasions.</p>`
    : '';

  return `
    ${qualityChart}
    ${qualitySummary}

    ${hoursSection}

    ${connectionsSection}
    ${lagHtml}

    <div class="explainer-box">
      <p class="explainer-title">Reading this page</p>
      <p class="explainer-text">Quality and duration are separate measurements: a rating out of 5 given each morning, and a count of hours. They are charted separately because they can move apart - a long night can still be rated poorly, and that gap is itself worth seeing.</p>
    </div>
  `;
}
