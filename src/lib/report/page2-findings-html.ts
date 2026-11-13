import { higherIsWorse } from '@/lib/domain-polarity';
import { interventionImpactFindings } from '@/lib/pattern-findings';
import { patternEvolutionHeadline, patternEvolutionStatLine } from '@/lib/report/chart-utils';
import type { ChartDomain, ChartMarker } from '@/lib/report/chart-coordinates';
import { textHeightPt, type FlowSection } from '@/lib/report/flow-pages';
import { periodTrendArrow, periodTrendColor, type DomainTrends } from '@/lib/report/period-trend';
import { renderSparklineSvg, sparklineMarkerXFraction, SPARKLINE_HEIGHT, SPARKLINE_WIDTH } from '@/lib/report/sparkline-svg';
import { CONTENT_WIDTH, DOMAIN_LABELS, MARKER_TYPE_LABELS, theme } from '@/lib/report/theme';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import type { DetectedCluster } from '@/lib/supabase';

// Scoped port of the EpisodeTimeline/RareEventsSection/DomainSparklineSection
// pieces of the web app's lib/report/sections/reportFindings.tsx — as HTML
// template functions instead of @react-pdf/renderer components, same
// approach as report-findings.ts/page1-html.ts. Colors/labels reused
// unchanged.
//
// Nothing here is capped any more. The timeline and rare-event lists are
// returned as FlowSections and paginated by flow-pages.ts, and every marker in
// the range is numbered on the charts — see flow-pages.ts for why.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtVal(v: number | undefined): string {
  return v != null ? (Math.round(v * 10) / 10).toFixed(1) : '-';
}

function clusterTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'sustained_deviation': return 'Sustained deviation';
    case 'intraday_volatility': return 'High variation';
    case 'rapid_cycling': return 'Rapid cycling';
    case 'baseline_shift': return 'Baseline shift';
    default: return 'Episode';
  }
}

function clusterColor(type: string | undefined): string {
  if (type === 'baseline_shift') return theme.colors.gray;
  if (type === 'rapid_cycling') return theme.colors.amber;
  return theme.colors.coral;
}

type TimelineEntry =
  | { kind: 'cluster'; date: string; cluster: DetectedCluster }
  | { kind: 'marker'; date: string; index: number; marker: ChartMarker };

function buildTimelineEntries(clusters: DetectedCluster[], chartMarkers: ChartMarker[], dates: string[]): TimelineEntry[] {
  return [
    ...clusters.map((cluster): TimelineEntry => ({ kind: 'cluster', date: cluster.start_date, cluster })),
    ...chartMarkers.map((marker, index): TimelineEntry => ({ kind: 'marker', date: dates[marker.dateIndex] ?? '', index, marker })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

/** Every marker in range, numbered oldest first; cycle Day 1 markers are
 *  lettered C instead. The timeline and the charts share these numbers. */
export function computeMarkerDisplayNumbers(chartMarkers: ChartMarker[]): Map<number, number | 'C'> {
  const ordered = chartMarkers
    .map((marker, index) => ({ marker, index }))
    .sort((a, b) => a.marker.dateIndex - b.marker.dateIndex);
  const map = new Map<number, number | 'C'>();
  let n = 0;
  for (const { marker, index } of ordered) {
    if (marker.markerType === 'cycle_phase') { map.set(index, 'C'); continue; }
    n += 1;
    map.set(index, n);
  }
  return map;
}

// ── Marker labels ───────────────────────────────────────────────────────────

/** Each label is about this wide (px); closer than this and two overlap. */
const MARKER_LABEL_MIN_GAP_PX = 16;
const MARKER_ROW_PT = 8;

/**
 * Stacks marker labels that would otherwise collide. Two markers a day apart
 * printed their numbers on top of each other — "2" and "3" read as "23" on a
 * printed report. Each label takes the first row where it clears the label
 * before it.
 */
function assignMarkerRows(xsPx: number[]): { rows: number[]; rowCount: number } {
  const order = xsPx.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const lastXByRow: number[] = [];
  const rows = new Array<number>(xsPx.length).fill(0);
  for (const { x, i } of order) {
    let row = lastXByRow.findIndex(last => x - last >= MARKER_LABEL_MIN_GAP_PX);
    if (row === -1) { row = lastXByRow.length; lastXByRow.push(x); }
    else lastXByRow[row] = x;
    rows[i] = row;
  }
  return { rows, rowCount: Math.max(1, lastXByRow.length) };
}

/** How many label rows a set of markers needs at a given chart width. */
export function markerRowCount(chartMarkers: ChartMarker[], datesLength: number, width: number = SPARKLINE_WIDTH): number {
  if (chartMarkers.length === 0) return 0;
  return assignMarkerRows(chartMarkers.map(m => sparklineMarkerXFraction(m.dateIndex, datesLength, width) * width)).rowCount;
}

// ── DomainSparklineSection ──────────────────────────────────────────────────

export function buildDomainSparklineSectionHtml(params: {
  chartDomains: ChartDomain[];
  baselineMap: Record<string, number>;
  /** Earlier-vs-recent medians per domain, the same numbers the Domain
   *  Summary table's trend column and pattern evolution use. */
  trends: DomainTrends;
  chartHasEnoughData: boolean;
  chartMarkers: ChartMarker[];
  dates: string[];
  /** Sparkline line/dot color. Defaults to the mind indigo; the Body charts
   *  pass BODY_COLOR instead. */
  lineColor?: string;
  /** Per-domain "is a lower value clinically better" check, used for the
   *  endpoint dot's deviation color. Defaults to domain-polarity.ts. */
  isLowerBetterFn?: (domain: string) => boolean;
  /** Heading for this block. Continuation pages pass a "(continued)" variant
   *  so a reader can tell a second page of charts from a second set. */
  label?: string;
  /** Chart width in px, for a chart sitting beside another rather than
   *  spanning the page (the Sleep page's quality chart, next to its
   *  hours-slept chart). */
  width?: number;
  /** Chart height in px. Defaults to SPARKLINE_HEIGHT; a chart page passes a
   *  taller value — see computeSparklineRowHeightPx, below. */
  height?: number;
  /** Spell the numbered markers out beneath the axis. Chart pages turn it
   *  on; the Sleep page's half-width chart sits beside its own captions. */
  showMarkerKey?: boolean;
}): string {
  const {
    chartDomains, baselineMap, trends, chartHasEnoughData, chartMarkers, dates,
    lineColor = theme.colors.mindLine, isLowerBetterFn = higherIsWorse,
    label = 'Domain sparklines', width = SPARKLINE_WIDTH, height = SPARKLINE_HEIGHT, showMarkerKey = false,
  } = params;

  if (!chartHasEnoughData) {
    return `<div class="section-gap"><p class="section-label">${esc(label)}</p><p class="empty-muted">Fewer than 7 days of data - charts omitted.</p></div>`;
  }

  // Stated once at the top of the section too — a reader landing on a chart
  // page (every chart shares this one x-axis) shouldn't have to scan to the
  // bottom to find out what span they're looking at.
  const rangeLabel = dates.length > 0 ? `${esc(fmtDay(dates[0] ?? ''))} – ${esc(fmtDay(dates[dates.length - 1] ?? ''))}` : '';

  const markerNumberByIndex = computeMarkerDisplayNumbers(chartMarkers);
  const xsPx = chartMarkers.map(m => sparklineMarkerXFraction(m.dateIndex, dates.length, width) * width);
  const { rows: markerRows, rowCount } = assignMarkerRows(xsPx);

  const rows = chartDomains.map(cd => {
    const trend = trends.byDomain[cd.domain];
    const baseline = baselineMap[cd.domain];
    const label = DOMAIN_LABELS[cd.domain] ?? cd.domain;
    const arrow = periodTrendArrow(trend);
    const arrowColor = periodTrendColor(cd.domain, trend);
    const isLowerBetter = isLowerBetterFn(cd.domain);
    const svg = renderSparklineSvg(cd, dates, lineColor, isLowerBetter, width, height);
    // Coverage, stated per domain. A line with readings on 12 of 60 days and
    // one with 58 are drawn identically, and a gap for "not logged" looks the
    // same as a flat stretch — so a sparse series reads as an equally solid
    // trend unless the page says otherwise.
    const logged = cd.points.filter(p => p.value != null).length;
    // The arrow's own numbers, beside it, so it can be checked by eye.
    const trendText = trend
      ? `first ${trends.windowDays}d ${fmtVal(trend.earlier)} &rarr; last ${trends.windowDays}d ${fmtVal(trend.recent)}`
      : 'no trend: too few readings';
    const noDataHeight = (height * 0.75).toFixed(1); // px -> pt, matching the chart it stands in for
    return `<div class="spark-cell">
        <div class="spark-header"><span style="font-weight:bold; color:${theme.colors.heading};">${esc(label)} <span style="color:${arrowColor};">${arrow}</span></span><span class="spark-meta">base ${fmtVal(baseline)} &middot; ${trendText} &middot; ${logged}/${dates.length} days</span></div>
        ${svg || `<div class="spark-no-data" style="height:${noDataHeight}pt;">Insufficient data</div>`}
      </div>`;
  }).join('');

  const markerLines = chartMarkers.map((_, i) => {
    const left = `${((xsPx[i] / width) * 100).toFixed(2)}%`;
    return `<div class="marker-line" style="left:${left};"></div>`;
  }).join('');
  const markerNumbers = chartMarkers.map((_, i) => {
    const left = `${((xsPx[i] / width) * 100).toFixed(2)}%`;
    const bottom = -(MARKER_ROW_PT + markerRows[i] * MARKER_ROW_PT);
    return `<div class="marker-number" style="left:${left}; bottom:${bottom}pt;">${markerNumberByIndex.get(i) ?? ''}</div>`;
  }).join('');
  // The axis sits beneath the lowest row of labels.
  const axisMarginPt = chartMarkers.length > 0 ? MARKER_ROW_PT * rowCount : MARKER_ROW_PT;

  // px, not pt. `width` is the <svg width> attribute, which is read as CSS
  // pixels; the marker lines and numbers are positioned as a percentage of
  // THIS box, so it must be exactly as wide as the charts.
  return `<div class="section-gap">
    <div class="section-label-row">
      <p class="section-label">${esc(label)}</p>
      <span class="section-label-dates">${rangeLabel}</span>
    </div>
    <div class="spark-stack" style="width:${width}px;">
      ${rows}
      ${markerLines}
      ${markerNumbers}
    </div>
    <div class="spark-axis" style="width:${width}px; margin-top:${axisMarginPt}pt;">
      <span>${esc(fmtDay(dates[0] ?? ''))}</span>
      <span>${esc(fmtDay(dates[dates.length - 1] ?? ''))}</span>
    </div>
    ${showMarkerKey ? markerKeyHtml(chartMarkers, dates) : ''}
  </div>`;
}

// ── Marker key ──────────────────────────────────────────────────────────────

function markerKeyEntries(chartMarkers: ChartMarker[], dates: string[]): { number: number | 'C'; text: string }[] {
  const numbers = computeMarkerDisplayNumbers(chartMarkers);
  return chartMarkers
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.dateIndex - b.m.dateIndex)
    .map(({ m, i }) => ({
      number: numbers.get(i) ?? '',
      text: `${fmtDay(dates[m.dateIndex] ?? '')} ${m.markerType === 'cycle_phase' ? (MARKER_TYPE_LABELS[m.markerType] ?? 'Cycle day 1') : m.label}`,
    })) as { number: number | 'C'; text: string }[];
}

/**
 * The numbered markers, spelled out along the foot of a chart page, so a
 * reader looking at a line under "5" doesn't have to turn back to the
 * Overview's timeline to learn it was "22 Sept Unwell overnight".
 */
function markerKeyHtml(chartMarkers: ChartMarker[], dates: string[]): string {
  if (chartMarkers.length === 0) return '';
  const items = markerKeyEntries(chartMarkers, dates)
    .map(e => `<span class="marker-key-item"><span class="marker-key-num">${e.number}</span>${esc(e.text)}</span>`)
    .join('');
  return `<div class="marker-key">${items}</div>`;
}

/** Height the key takes on the page, pt. Generous, like flow-pages' own. */
export function markerKeyHeightPt(chartMarkers: ChartMarker[], dates: string[]): number {
  if (chartMarkers.length === 0) return 0;
  const text = markerKeyEntries(chartMarkers, dates).map(e => `${e.number}  ${e.text}`).join('      ');
  return textHeightPt(text, 7, CONTENT_WIDTH) + 8;
}

// ── Sparkline pagination ────────────────────────────────────────────────────

/**
 * Most charts on one page. One column, full width: two columns of narrow
 * charts proved hard to read on paper, with a column's marker numbers easy
 * to attribute to the wrong stack.
 *
 * Checked with scripts/report-layout/measure-report.mjs, which renders the
 * real document in Chromium against both platforms' fonts. Re-run it before
 * changing this number.
 */
export const SPARKLINES_PER_PAGE = 3;

/**
 * Per-chart SVG height (px) for a chart page holding `rows` charts.
 *
 * Fitted from scripts/report-layout/measure-report.mjs against this page's
 * CSS: a page's fixed overhead (~105.3pt: page header and footer, section
 * label, axis), each chart's own overhead excluding the chart (~18.7pt:
 * header line, cell margin), and the trailing explainer box (~46.1pt).
 * Extra rows of marker labels come off the charts' share.
 */
function computeSparklineRowHeightPx(rows: number, hasTrailingExplainer: boolean, extraPt: number): number {
  const BUDGET_PT = 498; // a few pt under the page's 504pt printable height
  const FIXED_OVERHEAD_PT = 105.3;
  const PER_ROW_OVERHEAD_PT = 18.7;
  const EXPLAINER_PT = 58; // two lines of text since it explains the trend arrow too
  const MIN_HEIGHT_PX = SPARKLINE_HEIGHT;
  const MAX_HEIGHT_PX = 150; // design cap — taller reads oddly thin for a sparkline

  const available = BUDGET_PT - FIXED_OVERHEAD_PT - extraPt - (hasTrailingExplainer ? EXPLAINER_PT : 0);
  const heightPt = available / rows - PER_ROW_OVERHEAD_PT;
  const heightPx = heightPt / 0.75; // pt -> CSS px
  return Math.max(MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, Math.floor(heightPx)));
}

export interface SparklineLayout {
  /** Renders on the parent page: the "fewer than 7 days" note, or nothing
   *  once the charts have pages of their own. */
  inline: string;
  /** One page body per page of charts, in order. Empty when there are none. */
  pages: string[];
}

/**
 * Puts the charts on pages of their own, at most SPARKLINES_PER_PAGE to a
 * page and spread evenly (five charts are three and two, not three and one
 * wide orphan).
 *
 * `trailingHtml` (the "reading these charts" explainer) follows the charts
 * wherever they end up — on the last chart page, or inline when there are no
 * charts to put on one.
 */
export function layOutSparklines(
  params: Parameters<typeof buildDomainSparklineSectionHtml>[0] & { trailingHtml?: string },
): SparklineLayout {
  const { trailingHtml = '', ...sectionParams } = params;
  const { chartDomains, chartHasEnoughData, chartMarkers, dates } = sectionParams;

  // A user tracking nothing gets no charts and no chart pages — not an empty
  // page with a heading on it.
  if (chartDomains.length === 0) return { inline: '', pages: [] };

  // Too little data is one short note, which belongs with the sections that
  // introduce it rather than alone on a page of its own.
  if (!chartHasEnoughData) {
    return { inline: buildDomainSparklineSectionHtml(sectionParams) + trailingHtml, pages: [] };
  }

  const pageCount = Math.ceil(chartDomains.length / SPARKLINES_PER_PAGE);
  const perPage = Math.ceil(chartDomains.length / pageCount);
  // Extra rows of stacked marker numbers, and the key spelling them out,
  // both come off the charts' share of the page.
  const extraMarkerRowsPt = Math.max(0, markerRowCount(chartMarkers, dates.length) - 1) * MARKER_ROW_PT
    + markerKeyHeightPt(chartMarkers, dates);

  const pages: string[] = [];
  for (let i = 0; i < chartDomains.length; i += perPage) {
    const slice = chartDomains.slice(i, i + perPage);
    const isLastPage = i + perPage >= chartDomains.length;
    pages.push(buildDomainSparklineSectionHtml({
      ...sectionParams,
      chartDomains: slice,
      label: i === 0 ? sectionParams.label : `${sectionParams.label ?? 'Domain sparklines'} (continued)`,
      height: computeSparklineRowHeightPx(slice.length, isLastPage && trailingHtml.length > 0, extraMarkerRowsPt),
      showMarkerKey: true,
    }));
  }
  pages[pages.length - 1] += trailingHtml;
  return { inline: '', pages };
}

// ── EpisodeTimeline ──────────────────────────────────────────────────────────

const TIMELINE_TEXT_WIDTH_PT = CONTENT_WIDTH - 16;

/** Every flagged episode and every marker in range, newest first. */
export function buildEpisodeTimelineSection(params: {
  clusters: DetectedCluster[];
  chartMarkers: ChartMarker[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
}): FlowSection {
  const { clusters, chartMarkers, dates, interventionImpacts } = params;

  const impactFindingsByMarkerId = new Map(interventionImpactFindings(interventionImpacts).map(f => [f.id.replace(/^impact-/, ''), f]));
  const impactFindingByMarker = new Map(interventionImpacts.map(impact => [`${impact.marker_date}|${impact.marker_type}`, impactFindingsByMarkerId.get(impact.marker_id)]));
  const markerNumbers = computeMarkerDisplayNumbers(chartMarkers);
  const small = theme.fontSize.small;

  const rows = buildTimelineEntries(clusters, chartMarkers, dates).map(entry => {
    if (entry.kind === 'cluster') {
      const c = entry.cluster;
      const startFmt = fmtDay(c.start_date);
      const dateRange = !c.end_date ? `${startFmt}-ongoing` : c.end_date === c.start_date ? startFmt : `${startFmt}-${fmtDay(c.end_date)}`;
      const label = clusterTypeLabel(c.cluster_type);
      const domains = (c.domains_involved ?? []).map(d => DOMAIN_LABELS[d] ?? d).join(', ');
      const text = `${dateRange} · ${label} · ${domains}`;
      return {
        html: `<div class="timeline-row">
        <span class="timeline-dot-square" style="background:${clusterColor(c.cluster_type)};"></span>
        <span class="timeline-text">${esc(text)}</span>
      </div>`,
        heightPt: textHeightPt(text, small, TIMELINE_TEXT_WIDTH_PT) + 3,
      };
    }
    const m = entry.marker;
    const dateFmt = entry.date ? fmtDay(entry.date) : '-';
    const typeLabel = MARKER_TYPE_LABELS[m.markerType] ?? m.markerType;
    const impact = (m.markerType === 'medication' || m.markerType === 'therapy') ? impactFindingByMarker.get(`${entry.date}|${m.markerType}`) : undefined;
    const markerNumber = markerNumbers.get(entry.index);
    const dotHtml = markerNumber != null
      ? `<span class="timeline-dot-numbered">${markerNumber}</span>`
      : `<span class="timeline-dot-circle"></span>`;
    const impactText = impact
      ? `${impact.sentence} (${impact.evidenceLine})`
      : (m.markerType === 'medication' || m.markerType === 'therapy')
      ? 'Not enough data before/after yet to read an effect.'
      : '';
    const text = `${dateFmt} · ${typeLabel} · ${m.label}`;
    return {
      html: `<div>
      <div class="timeline-row">${dotHtml}<span class="timeline-text">${esc(text)}</span></div>
      ${impactText ? `<p class="impact-line">${esc(impactText)}</p>` : ''}
    </div>`,
      heightPt: textHeightPt(text, small, TIMELINE_TEXT_WIDTH_PT) + 3
        + (impactText ? textHeightPt(impactText, small, TIMELINE_TEXT_WIDTH_PT) + 3 : 0),
    };
  });

  return {
    title: 'Event and intervention timeline',
    rows,
    empty: { html: `<p class="empty-muted">No events or interventions to display.</p>`, heightPt: 16 },
  };
}

// ── RareEventsSection ────────────────────────────────────────────────────────

/** Every rare event and every pattern-evolution finding in range. Empty
 *  (no rows, no heading) when there are none. */
export function buildRareEventsSection(rareEvents: RareEvent[], patternEvolution: PatternEvolution[]): FlowSection {
  const small = theme.fontSize.small;
  const label = theme.fontSize.label;

  const rareRows = rareEvents.map(ev => {
    const domains = ev.affected_domains.length > 0 ? ev.affected_domains.map(d => DOMAIN_LABELS[d] ?? d).join(', ') : 'Multiple domains';
    const occurredText = ev.occurrence_dates.length > 0 ? `Occurred: ${ev.occurrence_dates.map(fmtDay).join(', ')}` : '';
    const title = `${domains} - rare event`;
    return {
      html: `<div class="rare-row">
      <div class="rare-header"><span class="rare-title">${esc(title)}</span><span class="rare-meta">${ev.frequency} occurrence${ev.frequency !== 1 ? 's' : ''}</span></div>
      <p class="rare-body">${esc(ev.clinical_note)}</p>
      ${occurredText ? `<p class="rare-occurred">${esc(occurredText)}</p>` : ''}
      ${ev.consequence_pattern ? `<p class="rare-body">${esc(ev.consequence_pattern)}</p>` : ''}
    </div>`,
      heightPt: 6 + textHeightPt(title, label, CONTENT_WIDTH - 80) + 2
        + textHeightPt(ev.clinical_note, small) + 2
        + (occurredText ? textHeightPt(occurredText, small) + 2 : 0)
        + (ev.consequence_pattern ? textHeightPt(ev.consequence_pattern, small) + 2 : 0),
    };
  });

  const evoRows = patternEvolution.map(pe => {
    const domain = DOMAIN_LABELS[pe.domain] ?? pe.domain;
    const title = `${domain} - ${patternEvolutionHeadline(pe)}`;
    const stat = `${patternEvolutionStatLine(pe)}.`;
    return {
      html: `<div class="rare-row">
      <div class="rare-header"><span class="rare-title">${esc(title)}</span><span class="rare-meta">${esc(fmtDay(pe.first_period_start))} - ${esc(fmtDay(pe.recent_period_end))}</span></div>
      <p class="rare-body">${esc(stat)}</p>
    </div>`,
      heightPt: 6 + textHeightPt(title, label, CONTENT_WIDTH - 80) + 2 + textHeightPt(stat, small) + 2,
    };
  });

  return { title: 'Rare events & pattern evolution', rows: [...rareRows, ...evoRows] };
}
