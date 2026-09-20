import { interventionImpactFindings } from '@/lib/pattern-findings';
import { patternEvolutionHeadline, patternEvolutionStatLine } from '@/lib/report/chart-utils';
import type { ChartDomain, ChartMarker } from '@/lib/report/chart-coordinates';
import { renderSparklineSvg, sparklineMarkerXFraction, SPARKLINE_WIDTH } from '@/lib/report/sparkline-svg';
import { DOMAIN_LABELS, LOWER_IS_BETTER, MARKER_TYPE_LABELS, theme } from '@/lib/report/theme';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import type { DetectedCluster } from '@/lib/supabase';

// Scoped port of the EpisodeTimeline/RareEventsSection/DomainSparklineSection
// pieces of the web app's lib/report/sections/reportFindings.tsx — as HTML
// template functions instead of @react-pdf/renderer components, same
// approach as report-findings.ts/page1-html.ts. Colors/labels reused
// unchanged; computeMarkerDisplayNumbers' numbering logic is unchanged too.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

const TIMELINE_MAX_ENTRIES = 4;

type TimelineEntry =
  | { kind: 'cluster'; date: string; cluster: DetectedCluster }
  | { kind: 'marker'; date: string; index: number; marker: ChartMarker };

function buildTimelineEntries(clusters: DetectedCluster[], chartMarkers: ChartMarker[], dates: string[]): TimelineEntry[] {
  return [
    ...clusters.map((cluster): TimelineEntry => ({ kind: 'cluster', date: cluster.start_date, cluster })),
    ...chartMarkers.map((marker, index): TimelineEntry => ({ kind: 'marker', date: dates[marker.dateIndex] ?? '', index, marker })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

export function computeMarkerDisplayNumbers(clusters: DetectedCluster[], chartMarkers: ChartMarker[], dates: string[]): Map<number, number | 'C'> {
  const shown = buildTimelineEntries(clusters, chartMarkers, dates).slice(0, TIMELINE_MAX_ENTRIES);
  const shownMarkers = shown
    .filter((e): e is Extract<TimelineEntry, { kind: 'marker' }> => e.kind === 'marker')
    .sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<number, number | 'C'>();
  let n = 0;
  shownMarkers.forEach(entry => {
    if (entry.marker.markerType === 'cycle_phase') {
      map.set(entry.index, 'C');
      return;
    }
    n += 1;
    map.set(entry.index, n);
  });
  return map;
}

// ── DomainSparklineSection ──────────────────────────────────────────────────

export function buildDomainSparklineSectionHtml(params: {
  chartDomains: ChartDomain[];
  baselineMap: Record<string, number>;
  currentRollingMedians: Record<string, number>;
  chartHasEnoughData: boolean;
  chartMarkers: ChartMarker[];
  flaggedClusters: DetectedCluster[];
  dates: string[];
  /** Sparkline line/dot color. Defaults to the mind indigo used on Page 2;
   *  the Body Overview page passes BODY_COLOR instead. */
  lineColor?: string;
  /** Per-domain "is a lower value clinically better" check, used for the
   *  endpoint dot's deviation color. Defaults to the mind-only LOWER_IS_BETTER
   *  Set; the Body Overview page passes `() => true` since every body domain
   *  is a severity scale — see LOWER_IS_BETTER's own comment in theme.ts. */
  isLowerBetterFn?: (domain: string) => boolean;
  /** Heading for this block. Continuation pages pass a "(continued)" variant
   *  so a reader can tell a second page of charts from a second set. */
  label?: string;
}): string {
  const {
    chartDomains, baselineMap, currentRollingMedians, chartHasEnoughData, chartMarkers, flaggedClusters, dates,
    lineColor = '#818cf8', isLowerBetterFn = (d: string) => LOWER_IS_BETTER.has(d),
    label = 'Domain sparklines',
  } = params;

  if (!chartHasEnoughData) {
    return `<div class="section-gap"><p class="section-label">${esc(label)}</p><p class="empty-muted">Fewer than 7 days of data - charts omitted.</p></div>`;
  }

  const markerNumberByIndex = computeMarkerDisplayNumbers(flaggedClusters, chartMarkers, dates);
  const numberedMarkers = chartMarkers
    .map((marker, index) => ({ marker, number: markerNumberByIndex.get(index) }))
    .filter((m): m is { marker: ChartMarker; number: number | 'C' } => m.number != null);

  const rows = chartDomains.map(cd => {
    const current = currentRollingMedians[cd.domain];
    const baseline = baselineMap[cd.domain];
    const label = DOMAIN_LABELS[cd.domain] ?? cd.domain;
    const bVal = baseline != null ? (Math.round(baseline * 10) / 10).toFixed(1) : '-';
    const cVal = current != null ? (Math.round(current * 10) / 10).toFixed(1) : '-';
    let arrow = '→';
    if (current != null && baseline != null && Math.abs(current - baseline) >= 0.3) arrow = current > baseline ? '↑' : '↓';
    const headerColor = current != null && baseline != null && Math.abs(current - baseline) >= 0.5 ? theme.colors.heading : theme.colors.gray;
    const isLowerBetter = isLowerBetterFn(cd.domain);
    const svg = renderSparklineSvg(cd, dates, lineColor, isLowerBetter);
    return `<div class="spark-cell">
      <div class="spark-header"><span style="color:${headerColor}; font-weight:bold;">${esc(label)} ${arrow}</span><span class="spark-meta">base ${bVal} &middot; now ${cVal}</span></div>
      ${svg || `<div class="spark-no-data">Insufficient data</div>`}
    </div>`;
  }).join('');

  const markerLines = numberedMarkers.map(({ marker }) => {
    const left = `${(sparklineMarkerXFraction(marker.dateIndex, dates.length) * 100).toFixed(2)}%`;
    return `<div class="marker-line" style="left:${left};"></div>`;
  }).join('');
  const markerNumbers = numberedMarkers.map(({ marker, number }) => {
    const left = `${(sparklineMarkerXFraction(marker.dateIndex, dates.length) * 100).toFixed(2)}%`;
    return `<div class="marker-number" style="left:${left};">${number}</div>`;
  }).join('');

  return `<div class="section-gap">
    <p class="section-label">${esc(label)}</p>
    <!-- px, not pt. SPARKLINE_WIDTH is the <svg width> attribute, which is
         read as CSS pixels; declaring the container in points made it 590pt
         against a 442.5pt chart. The marker lines and numbers below are
         positioned as a percentage of THIS box, so every medication, therapy
         and cycle marker was drawn a third of the way right of the date it
         marks — the last ones off the printable area entirely — on a chart a
         clinician reads dates off. -->
    <div class="spark-stack" style="width:${SPARKLINE_WIDTH}px;">
      ${rows}
      ${markerLines}
      ${markerNumbers}
    </div>
  </div>`;
}

// ── Sparkline pagination ────────────────────────────────────────────────────

/**
 * Sparkline rows per page of charts.
 *
 * Nothing bounded this before, on either the Mind or the Body overview page,
 * and both pages carry several other sections as well. A row is about 83pt
 * (a 9pt header, a 90px = 67.5pt chart, margins), against a usable body
 * height of roughly 616pt once the page header and footer are taken off a
 * US Letter page with this report's margins. Eight tracked domains is 664pt
 * of charts on its own, so those pages silently ran onto a second physical
 * sheet — which carries no header, no footer, and no page number, while the
 * "Page 3 of 5" printed above it goes on claiming otherwise.
 *
 * Six rows is 498pt, plus a 17pt section label and a 14pt gap: 529pt, leaving
 * headroom for the explainer box that follows the last page of charts. It is
 * deliberately conservative — this layout is measured by a print engine that
 * isn't available to test against here, so the cost of being wrong by a row
 * should be white space, not a lost page number.
 */
export const SPARKLINES_PER_PAGE = 6;

export interface SparklineLayout {
  /** Renders on the parent page: the "fewer than 7 days" note, or nothing
   *  once the charts have pages of their own. */
  inline: string;
  /** One page body per page of charts, in order. Empty when there are none. */
  pages: string[];
}

/**
 * Splits a set of sparklines between the page that introduces them and any
 * dedicated chart pages after it, so no page is asked to hold more than it
 * can print.
 *
 * `trailingHtml` (the "reading this page" explainer) follows the charts
 * wherever they end up — on the last chart page, or inline when there are no
 * charts to put on one.
 */
export function layOutSparklines(
  params: Parameters<typeof buildDomainSparklineSectionHtml>[0] & { trailingHtml?: string },
): SparklineLayout {
  const { trailingHtml = '', ...sectionParams } = params;
  const { chartDomains, chartHasEnoughData } = sectionParams;

  // A user tracking nothing gets no charts and no chart pages — not an empty
  // page with a heading on it.
  if (chartDomains.length === 0) return { inline: '', pages: [] };

  // Too little data is one short note, which belongs with the sections that
  // introduce it rather than alone on a page of its own.
  if (!chartHasEnoughData) {
    return { inline: buildDomainSparklineSectionHtml(sectionParams) + trailingHtml, pages: [] };
  }

  const pages: string[] = [];
  for (let i = 0; i < chartDomains.length; i += SPARKLINES_PER_PAGE) {
    pages.push(buildDomainSparklineSectionHtml({
      ...sectionParams,
      chartDomains: chartDomains.slice(i, i + SPARKLINES_PER_PAGE),
      label: i === 0 ? sectionParams.label : `${sectionParams.label ?? 'Domain sparklines'} (continued)`,
    }));
  }
  pages[pages.length - 1] += trailingHtml;
  return { inline: '', pages };
}

// ── EpisodeTimeline ──────────────────────────────────────────────────────────

export function buildEpisodeTimelineHtml(params: {
  clusters: DetectedCluster[];
  chartMarkers: ChartMarker[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
  showMarkerNumbers?: boolean;
}): string {
  const { clusters, chartMarkers, dates, interventionImpacts, showMarkerNumbers } = params;

  const impactFindingsByMarkerId = new Map(interventionImpactFindings(interventionImpacts).map(f => [f.id.replace(/^impact-/, ''), f]));
  const impactFindingByMarker = new Map(interventionImpacts.map(impact => [`${impact.marker_date}|${impact.marker_type}`, impactFindingsByMarkerId.get(impact.marker_id)]));
  const timelineEntries = buildTimelineEntries(clusters, chartMarkers, dates);
  const shown = timelineEntries.slice(0, TIMELINE_MAX_ENTRIES);
  const olderCount = timelineEntries.length - shown.length;
  const markerNumbers = showMarkerNumbers ? computeMarkerDisplayNumbers(clusters, chartMarkers, dates) : undefined;

  if (shown.length === 0) {
    return `<div class="section-gap"><p class="section-label">Event and intervention timeline</p><p class="empty-muted">No events or interventions to display.</p></div>`;
  }

  const rows = shown.map(entry => {
    if (entry.kind === 'cluster') {
      const c = entry.cluster;
      const startFmt = fmtDay(c.start_date);
      const dateRange = !c.end_date ? `${startFmt}-ongoing` : c.end_date === c.start_date ? startFmt : `${startFmt}-${fmtDay(c.end_date)}`;
      const label = clusterTypeLabel(c.cluster_type);
      const domains = (c.domains_involved ?? []).map(d => DOMAIN_LABELS[d] ?? d).join(', ');
      return `<div class="timeline-row">
        <span class="timeline-dot-square" style="background:${clusterColor(c.cluster_type)};"></span>
        <span class="timeline-text">${esc(dateRange)} &middot; ${esc(label)} &middot; ${esc(domains)}</span>
      </div>`;
    }
    const m = entry.marker;
    const dateFmt = entry.date ? fmtDay(entry.date) : '-';
    const typeLabel = MARKER_TYPE_LABELS[m.markerType] ?? m.markerType;
    const impact = (m.markerType === 'medication' || m.markerType === 'therapy') ? impactFindingByMarker.get(`${entry.date}|${m.markerType}`) : undefined;
    const markerNumber = markerNumbers?.get(entry.index);
    const dotHtml = markerNumber != null
      ? `<span class="timeline-dot-numbered">${markerNumber}</span>`
      : `<span class="timeline-dot-circle"></span>`;
    const impactHtml = impact
      ? `<p class="impact-line">${esc(impact.sentence)} (${esc(impact.evidenceLine)})</p>`
      : (m.markerType === 'medication' || m.markerType === 'therapy')
      ? `<p class="impact-line">Not enough data before/after yet to read an effect.</p>`
      : '';
    return `<div>
      <div class="timeline-row">${dotHtml}<span class="timeline-text">${esc(dateFmt)} &middot; ${esc(typeLabel)} &middot; ${esc(m.label)}</span></div>
      ${impactHtml}
    </div>`;
  }).join('');

  const overflowHtml = olderCount > 0 ? `<p class="empty-muted">${olderCount} earlier entr${olderCount !== 1 ? 'ies' : 'y'} not shown.</p>` : '';

  return `<div class="section-gap">
    <p class="section-label">Event and intervention timeline</p>
    ${rows}
    ${overflowHtml}
  </div>`;
}

// ── RareEventsSection ────────────────────────────────────────────────────────

const RARE_MAX_ENTRIES = 3;

export function buildRareEventsSectionHtml(rareEvents: RareEvent[], patternEvolution: PatternEvolution[]): string {
  if (rareEvents.length === 0 && patternEvolution.length === 0) return '';

  const shownRare = rareEvents.slice(0, RARE_MAX_ENTRIES);
  const shownEvo = patternEvolution.slice(0, Math.max(0, RARE_MAX_ENTRIES - shownRare.length));
  const hiddenCount = (rareEvents.length - shownRare.length) + (patternEvolution.length - shownEvo.length);

  const rareRows = shownRare.map(ev => {
    const domains = ev.affected_domains.length > 0 ? ev.affected_domains.map(d => DOMAIN_LABELS[d] ?? d).join(', ') : 'Multiple domains';
    const occurred = ev.occurrence_dates.length > 0 ? `<p class="rare-meta">Occurred: ${ev.occurrence_dates.map(fmtDay).join(', ')}</p>` : '';
    const consequence = ev.consequence_pattern ? `<p class="rare-body">${esc(ev.consequence_pattern)}</p>` : '';
    return `<div class="rare-row">
      <div class="rare-header"><span class="rare-title">${esc(domains)} - rare event</span><span class="rare-meta">${ev.frequency} occurrence${ev.frequency !== 1 ? 's' : ''}</span></div>
      <p class="rare-body">${esc(ev.clinical_note)}</p>
      ${occurred}
      ${consequence}
    </div>`;
  }).join('');

  const evoRows = shownEvo.map(pe => {
    const domain = DOMAIN_LABELS[pe.domain] ?? pe.domain;
    const from = new Date(pe.first_period_start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const to = new Date(pe.recent_period_end + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<div class="rare-row">
      <div class="rare-header"><span class="rare-title">${esc(domain)} - ${esc(patternEvolutionHeadline(pe))}</span><span class="rare-meta">${esc(from)} - ${esc(to)}</span></div>
      <p class="rare-body">${esc(patternEvolutionStatLine(pe))}.</p>
    </div>`;
  }).join('');

  const hiddenHtml = hiddenCount > 0 ? `<p class="empty-muted">${hiddenCount} additional entr${hiddenCount !== 1 ? 'ies' : 'y'} not shown.</p>` : '';

  return `<div class="section-gap">
    <p class="section-label">Rare events &amp; pattern evolution</p>
    ${rareRows}
    ${evoRows}
    ${hiddenHtml}
  </div>`;
}
