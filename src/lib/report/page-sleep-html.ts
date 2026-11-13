import type { LagRelationship } from '@/lib/detection/lag-relationships';
import { fmtHours, type SleepHoursConnection } from '@/lib/detection/sleep-hours-connections';
import type { SleepSymptomConnection } from '@/lib/queries/sleep-connections';
import type { ChartDomain, ChartMarker, SleepConnection } from '@/lib/report/chart-coordinates';
import { renderHoursSleptSvg, summariseHoursSlept, type HoursSleptPoint } from '@/lib/report/hours-slept-svg';
import { flowPages, textHeightPt, type FlowSection } from '@/lib/report/flow-pages';
import { buildDomainSparklineSectionHtml, markerRowCount } from '@/lib/report/page2-findings-html';
import type { DomainTrends } from '@/lib/report/period-trend';
import { SPARKLINE_WIDTH_HALF } from '@/lib/report/sparkline-svg';
import { DOMAIN_LABELS } from '@/lib/report/theme';

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
  /** Whole-period medians, for the "median rating" sentence. */
  currentRollingMedians: Record<string, number>;
  /** First-days vs last-days medians, for the chart's trend arrow — the same
   *  numbers every other chart's arrow uses. */
  trends: DomainTrends;
  chartMarkers: ChartMarker[];
  /** One entry per date in range, gaps included. */
  hoursPoints: HoursSleptPoint[];
  medianHours: number | null;
  /** The detector's own persisted good-vs-poor-sleep comparison, when a
   *  window overlapping this range has been computed. */
  persistedConnections: SleepSymptomConnection[];
  /** The in-report fallback: a plain mean split, no significance testing. */
  fallbackConnections: SleepConnection[];
  /** Duration's comparison: shortest vs longest third of nights. Already
   *  filtered to domains that differ, largest gap first. */
  hoursConnections: SleepHoursConnection[];
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

const TABLE_HEADER_PT = 14;
const TABLE_ROW_PT = 16;

/** One page body per sheet: both charts, then every domain in both tables,
 *  continuing onto a second page when there are more than one holds. The
 *  tables used to be capped at ten rows between them, the rest summarised as
 *  "N further domains with a smaller difference not listed". */
export function buildSleepPages(data: SleepPageData): string[] {
  const {
    qualityDomain, dates, baselineMap, currentRollingMedians, trends, chartMarkers,
    hoursPoints, medianHours, persistedConnections, fallbackConnections, hoursConnections, lagRelationships,
  } = data;

  const sleepBaseline = baselineMap['sleep'] ?? 3;
  const sleepCurrent = currentRollingMedians['sleep'];
  const deviating = sleepCurrent != null && Math.abs(sleepCurrent - sleepBaseline) >= 0.5;
  const deviationSuffix = deviating ? (sleepCurrent! < sleepBaseline ? ' - below baseline' : ' - above baseline') : '';

  // ── Quality ───────────────────────────────────────────────────────────────
  // Half-width (SPARKLINE_WIDTH_HALF), sitting beside the duration chart
  // below — both are a single series over the same date range, and the
  // landscape page has the width to show them side by side instead of
  // stacked, as they were in portrait.
  const qualityChart = qualityDomain
    ? buildDomainSparklineSectionHtml({
      chartDomains: [qualityDomain],
      baselineMap,
      trends,
      chartHasEnoughData: true,
      chartMarkers,
      dates,
      label: 'Sleep quality, rated 1-5 each morning',
      width: SPARKLINE_WIDTH_HALF,
    })
    : `<div class="section-gap"><p class="section-label">Sleep quality</p><p class="empty-muted">No sleep quality ratings in this period.</p></div>`;

  const qualitySummary = sleepCurrent != null
    ? `<p class="sleep-note">Median rating ${fmtVal(sleepCurrent)} / 5 against a personal baseline of ${fmtVal(sleepBaseline)}${deviationSuffix}.</p>`
    : '';

  // ── Duration ──────────────────────────────────────────────────────────────
  const hoursSummary = summariseHoursSlept(hoursPoints);
  const hoursSvg = medianHours != null ? renderHoursSleptSvg(hoursPoints, medianHours, SPARKLINE_WIDTH_HALF) : '';
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
  // worth showing only when the detector has not run over this range. Rows
  // arrive largest difference first.
  const poorNightCaption = persistedConnections.length > 0
    ? 'Nights column is good/poor nights compared. A difference is a mean gap, not a test of cause.'
    : 'A mean split between nights rated 2 or below and those above 3, computed for this report. No sample-size test.';
  const connectionsSection: FlowSection = persistedConnections.length > 0
    ? {
      title: 'What follows a poor night',
      open: {
        html: `<table class="domain-table">
          <thead><tr>
            <th>Domain</th>
            <th class="center">After good sleep</th>
            <th class="center">After poor sleep</th>
            <th class="center">Difference</th>
            <th class="center">Nights</th>
          </tr></thead>
          <tbody>`,
        heightPt: TABLE_HEADER_PT,
      },
      rows: persistedConnections.map(c => ({
        html: `<tr>
              <td>${esc(label(c.domain))}</td>
              <td class="center">${fmtVal(c.avg_after_good_sleep)}</td>
              <td class="center">${fmtVal(c.avg_after_poor_sleep)}</td>
              <td class="center">${c.difference > 0 ? '+' : ''}${fmtVal(c.difference)}</td>
              <td class="center">${c.good_sleep_count}/${c.poor_sleep_count}</td>
            </tr>`,
        heightPt: TABLE_ROW_PT,
      })),
      close: '</tbody></table>',
      footer: { html: `<p class="sleep-chart-caption">${esc(poorNightCaption)}</p>`, heightPt: textHeightPt(poorNightCaption, 7) + 2 },
    }
    : {
      title: 'What follows a poor night',
      rows: fallbackConnections.map(c => ({
        html: `<div class="sleep-row"><span class="sleep-label">${esc(label(c.domain))}</span><span class="sleep-value">${esc(c.observation)}</span></div>`,
        heightPt: TABLE_ROW_PT,
      })),
      footer: { html: `<p class="sleep-chart-caption">${esc(poorNightCaption)}</p>`, heightPt: textHeightPt(poorNightCaption, 7) + 2 },
    };

  // ── Duration relationships ────────────────────────────────────────────────
  // The same question asked of hours slept rather than the rating. "Short"
  // and "long" are this patient's own lower and upper third of nights, so
  // the cut-offs are printed in the column headers — without them a reader
  // would assume a population threshold.
  const first = hoursConnections[0];
  const shortNightCaption = first
    ? `Short and long are this patient's own shortest and longest third of ${first.nights} nights. Nights: short/long compared.`
    : '';
  const hoursConnectionsSection: FlowSection = {
    title: 'What follows a short night',
    open: first ? {
      html: `<table class="domain-table">
          <thead><tr>
            <th>Domain</th>
            <th class="center">After &le;${fmtHours(first.shortCutoff)} h</th>
            <th class="center">After &ge;${fmtHours(first.longCutoff)} h</th>
            <th class="center">Difference</th>
            <th class="center">Nights</th>
          </tr></thead>
          <tbody>`,
      heightPt: TABLE_HEADER_PT,
    } : undefined,
    rows: hoursConnections.map(c => ({
      html: `<tr>
              <td>${esc(label(c.domain))}</td>
              <td class="center">${fmtVal(c.shortMean)}</td>
              <td class="center">${fmtVal(c.longMean)}</td>
              <td class="center">${c.difference > 0 ? '+' : ''}${fmtVal(c.difference)}</td>
              <td class="center">${c.shortDays}/${c.longDays}</td>
            </tr>`,
      heightPt: TABLE_ROW_PT,
    })),
    close: '</tbody></table>',
    footer: first ? { html: `<p class="sleep-chart-caption">${esc(shortNightCaption)}</p>`, heightPt: textHeightPt(shortNightCaption, 7) + 2 } : undefined,
  };

  const sleepLag = lagRelationships.find(r => r.predictor === 'sleep');
  const lagText = sleepLag
    ? `Lag relationship: ${label(sleepLag.predictor as string)} predicts ${label(sleepLag.outcome as string)} ${sleepLag.lagDays} day${sleepLag.lagDays !== 1 ? 's' : ''} later, on ${Math.round(sleepLag.instanceRate * 100)}% of occasions.`
    : '';
  const explainerText = 'Quality and duration are separate measurements: a rating out of 5 given each morning, and a count of hours. They are charted separately because they can move apart - a long night can still be rated poorly, and that gap is itself worth seeing.';

  const tail: FlowSection = {
    rows: [
      ...(lagText ? [{ html: `<p class="sleep-note">${esc(lagText)}</p>`, heightPt: textHeightPt(lagText) + 6 }] : []),
      {
        html: `<div class="explainer-box">
      <p class="explainer-title">Reading this page</p>
      <p class="explainer-text">${esc(explainerText)}</p>
    </div>`,
        heightPt: textHeightPt(explainerText) + 34,
      },
    ],
  };

  // The two charts side by side open the first page. Their height is fixed
  // but for the rows of marker numbers under the quality chart.
  const chartsHtml = `
    <div class="two-col">
      <div class="chart-col">
        ${qualityChart}
        ${qualitySummary}
      </div>
      <div class="chart-col">
        ${hoursSection}
      </div>
    </div>`;
  const chartsPt = 160 + 8 * markerRowCount(chartMarkers, dates.length, SPARKLINE_WIDTH_HALF);

  return flowPages([connectionsSection, hoursConnectionsSection, tail], { html: chartsHtml, heightPt: chartsPt });
}
