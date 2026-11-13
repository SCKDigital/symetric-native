import { parseDateString } from '@/lib/date-utils';
import { isBodyDomain } from '@/lib/pattern-findings';
import type { ChartDomain, ChartMarker } from '@/lib/report/chart-coordinates';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { RareEvent } from '@/lib/detection/rare-events';
import { flowPages, textHeightPt, type FlowRow, type FlowSection } from '@/lib/report/flow-pages';
import { buildBodyOverviewSections, type BodyOverviewData } from '@/lib/report/page-body-overview-html';
import { BODY_MAP_HEIGHT_PT, buildBodyMapHtml } from '@/lib/report/body-map-svg';
import { combineTimeOfDay, findingRowHtml, patternCardHtml, type Page1Data } from '@/lib/report/page1-html';
import {
  buildDomainSparklineSectionHtml, buildEpisodeTimelineSection, buildRareEventsSection,
  MARKER_ROW_PT, markerKeyHeightPt, markerRowCount,
} from '@/lib/report/page2-findings-html';
import type { DomainTrends } from '@/lib/report/period-trend';
import { buildUnifiedFindings, patternCardColor, type UnifiedFinding } from '@/lib/report/report-findings';
import { CONTENT_WIDTH, theme } from '@/lib/report/theme';
import type { DetectedCluster } from '@/lib/supabase';

// The basic report: a summary sheet, at most two sheets of mind and at most
// two of body. The comprehensive report lists everything; this one is fitted
// to its sheets, and says so wherever it leaves something out.
//
// Fitting is by rank, not by fixed caps. Each page's sections are laid out in
// order of importance; while they run past the page limit the last row of the
// least important trimmable section is dropped, and a "+N more" line takes
// its place. A light record therefore prints in full, and a heavy one is cut
// at exactly the limit.

interface FitSection extends FlowSection {
  /** Rows this section keeps however full the page. Without it the section
   *  is never trimmed. */
  minRows?: number;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function moreRow(n: number): FlowRow {
  const text = `+${n} more in the comprehensive report`;
  return { html: `<p class="deferred-note">${esc(text)}</p>`, heightPt: textHeightPt(text) + 8 };
}

function trimmed(s: FitSection, cut: number): FlowSection {
  if (cut === 0) return s;
  const rows = s.rows.slice(0, s.rows.length - cut);
  if (rows.length > 0) return { ...s, rows, footer: moreRow(cut) };
  // Nothing of it left: one line in its place, no heading.
  const text = `${s.title ?? 'More'}: ${cut} in the comprehensive report`;
  return { rows: [], empty: { html: `<p class="deferred-note">${esc(text)}</p>`, heightPt: textHeightPt(text) + 8 } };
}

/** Lays the sections out on at most `maxPages` sheets, trimming from the
 *  back. Returns more only if every section is already at its minimum. */
export function fitPages(sections: FitSection[], lead: FlowRow | undefined, maxPages: number): string[] {
  const cut = sections.map(() => 0);
  for (;;) {
    const pages = flowPages(sections.map((s, i) => trimmed(s, cut[i])), lead);
    if (pages.length <= maxPages) return pages;
    let j = sections.length - 1;
    while (j >= 0) {
      const s = sections[j];
      if (s.minRows != null && s.rows.length - cut[j] > s.minRows) break;
      j--;
    }
    if (j < 0) return pages;
    cut[j] += 1;
  }
}

// ── Charts ───────────────────────────────────────────────────────────────────

/**
 * Every domain on one sheet, one column, as short as that needs. Each chart's
 * header already carries the domain table's figures (baseline, first and last
 * days, the trend arrow), so the basic report has no separate table.
 */
function chartPage(params: {
  label: string;
  chartDomains: ChartDomain[];
  baselineMap: Record<string, number>;
  trends: DomainTrends;
  chartHasEnoughData: boolean;
  chartMarkers: ChartMarker[];
  dates: string[];
  lineColor?: string;
  isLowerBetterFn?: (d: string) => boolean;
}): string {
  const { chartDomains, chartMarkers, dates } = params;
  const n = Math.max(1, chartDomains.length);
  // Same fit as layOutSparklines' (page2-findings-html.ts), for n charts.
  const extraPt = Math.max(0, markerRowCount(chartMarkers, dates.length) - 1) * MARKER_ROW_PT
    + markerKeyHeightPt(chartMarkers, dates);
  // 480, not the chart pages' 498: these hold more charts, each with its
  // own header, and filled a sheet to 99-100% under Noto Sans at 498.
  const heightPt = (480 - 105.3 - extraPt) / n - 18.7;
  const height = Math.max(22, Math.min(110, Math.floor(heightPt / 0.75)));
  return buildDomainSparklineSectionHtml({ ...params, height, showMarkerKey: true });
}

// ── Findings ─────────────────────────────────────────────────────────────────

function findingsSection(title: string, findings: UnifiedFinding[], minRows: number): FitSection {
  const isMinorTimeOfDay = (f: UnifiedFinding) => f.kind === 'Time-of-day pattern' && f.tier !== 'high';
  const minor = findings.filter(isMinorTimeOfDay);
  const list = minor.length > 1 ? [...findings.filter(f => !isMinorTimeOfDay(f)), combineTimeOfDay(minor)] : findings;
  return {
    title,
    rows: list.map(f => ({
      html: findingRowHtml(f),
      heightPt: textHeightPt(`${f.headline} (${f.statLine})`, theme.fontSize.small, CONTENT_WIDTH - 70) + 4,
    })),
    minRows,
  };
}

const METHOD_NOTE = "Each domain is compared with this patient's own rolling baseline, never a population norm. Firm, partial and early signal say how much data stands behind a pattern. The comprehensive report sets out every entry, the method and data quality in full.";

/** Most-logged sites beside the map, where its notes leave room. */
const SITES_BESIDE_MAP = 6;

const isBodyFinding =(f: UnifiedFinding) => f.domains.length > 0 && f.domains.every(d => isBodyDomain(d));

// ── The report ───────────────────────────────────────────────────────────────

export interface BasicReportInput {
  page1: Page1Data;
  dates: string[];
  chartMarkers: ChartMarker[];
  interventionImpacts: InterventionImpact[];
  sleepMedianHours: number | null;
  mind: {
    chartDomains: ChartDomain[];
    chartHasEnoughData: boolean;
    flaggedClusters: DetectedCluster[];
    rareEvents: RareEvent[];
  };
  body: null | (Omit<BodyOverviewData, 'sparklinesInline'> & {
    chartDomains: ChartDomain[];
    chartHasEnoughData: boolean;
    lineColor: string;
  });
}

export function buildBasicReportPages(input: BasicReportInput): { sectionTitle: string; bodyHtml: string }[] {
  const { page1, dates, chartMarkers, interventionImpacts, sleepMedianHours, mind, body } = input;
  const all = buildUnifiedFindings(page1);
  const top = all.slice(0, 3);
  const rest = all.slice(3);
  const pages: { sectionTitle: string; bodyHtml: string }[] = [];

  // ── Summary ──
  const pct = page1.totalScheduled > 0 ? Math.round((page1.completedCheckIns / page1.totalScheduled) * 100) : 0;
  const fmtFull = (d: string) => parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lead: FlowRow = {
    html: `
    <div class="name-row"><span class="patient-name">${esc(page1.userName ?? 'Patient')}</span></div>
    ${page1.rangeLabel ? `<p class="report-period">Report period: ${esc(page1.rangeLabel)}</p>` : ''}
    <p class="subtitle">${esc(fmtFull(page1.dateFrom))} - ${esc(fmtFull(page1.dateTo))} &middot; Basic report: a summary. Every entry is in the comprehensive report.</p>
    <div class="completion-line"><span>${page1.completedCheckIns} of ${page1.totalScheduled} check-ins completed (${pct}%) this period</span></div>
    <p class="deferred-note" style="margin-bottom:6pt;">${esc(METHOD_NOTE)}</p>`,
    heightPt: 82 + (page1.rangeLabel ? 18 : 0) + textHeightPt(METHOD_NOTE) + 6,
  };
  const confidenceKey: FlowRow = {
    html: `
    <div class="confidence-key">
      <span><span class="dot" style="background:${patternCardColor('high')};"></span>Firm - enough data to stand on</span>
      <span><span class="dot" style="background:${patternCardColor('moderate')};"></span>Partial - worth watching</span>
      <span><span class="dot" style="background:${patternCardColor('early')};"></span>Early signal - limited coverage</span>
    </div>`,
    heightPt: 16,
  };
  // Medication, therapy and life events, each with its measured effect, as
  // the comprehensive timeline prints them. Cycle day 1s are left to the
  // charts' C markers; filtering them out keeps the other numbers as charted.
  const changes = buildEpisodeTimelineSection({
    clusters: [],
    chartMarkers: chartMarkers.map(m => (m.markerType === 'cycle_phase' ? null : m)).filter(Boolean) as ChartMarker[],
    dates,
    interventionImpacts,
  });
  pages.push(...fitPages([
    {
      title: 'Patterns detected this period',
      rows: top.map(f => ({
        html: patternCardHtml(f),
        heightPt: 10 + textHeightPt(f.headline, theme.fontSize.label, CONTENT_WIDTH - 70) + textHeightPt(`(${f.statLine})`, theme.fontSize.small, CONTENT_WIDTH - 20),
      })),
      open: top.length > 0 ? confidenceKey : undefined,
      empty: { html: `<p class="empty-muted">No patterns above confidence threshold this period.</p>`, heightPt: 16 },
    },
    {
      title: 'Patient wants to discuss',
      rows: page1.questions.map((q, i) => ({
        html: `<div class="discuss-item"><span class="discuss-bullet">${i + 1}</span><span class="discuss-text">${esc(q.question_text)}</span></div>`,
        heightPt: Math.max(16, textHeightPt(q.question_text, theme.fontSize.body, CONTENT_WIDTH - 30)) + 3,
      })),
    },
    { ...changes, title: 'Changes this period', empty: undefined, minRows: 3 },
  ], lead, 1).map(bodyHtml => ({ sectionTitle: 'Summary', bodyHtml })));

  // ── Mind ──
  pages.push({
    sectionTitle: 'Mind',
    bodyHtml: chartPage({
      label: 'Mind domains', chartDomains: mind.chartDomains, baselineMap: page1.baselineMap, trends: page1.trends,
      chartHasEnoughData: mind.chartHasEnoughData, chartMarkers, dates,
    }),
  });
  const sleepText = sleepMedianHours != null ? `Sleep: ${sleepMedianHours.toFixed(1)} hours a night (median of the nights logged).` : '';
  pages.push(...fitPages([
    findingsSection('Mind patterns', rest.filter(f => !isBodyFinding(f)), 3),
    { ...buildEpisodeTimelineSection({ clusters: mind.flaggedClusters, chartMarkers: [], dates, interventionImpacts: [] }), title: 'Episodes', empty: undefined, minRows: 0 },
    { ...buildRareEventsSection(mind.rareEvents, []), title: 'Rare events', minRows: 0 },
  ], sleepText ? { html: `<p class="completion-line">${esc(sleepText)}</p>`, heightPt: 24 } : undefined, 1)
    .map(bodyHtml => ({ sectionTitle: 'Mind', bodyHtml })));

  // ── Body ──
  if (body) {
    pages.push({
      sectionTitle: 'Body',
      bodyHtml: chartPage({
        label: 'Body domains', chartDomains: body.chartDomains, baselineMap: page1.bodyBaselineMap, trends: page1.bodyTrends,
        chartHasEnoughData: body.chartHasEnoughData, chartMarkers, dates, lineColor: body.lineColor, isLowerBetterFn: () => true,
      }),
    });
    const s = buildBodyOverviewSections(body);
    // The sites list sits in the map's right-hand column rather than below it.
    const siteRows = s.sites.rows;
    const shownSites = siteRows.slice(0, SITES_BESIDE_MAP).map(r => r.html).join('');
    const hiddenSites = siteRows.length - SITES_BESIDE_MAP;
    const mapHtml = buildBodyMapHtml(body.bodySiteFrequency,
      `${shownSites}${hiddenSites > 0 ? moreRow(hiddenSites).html : ''}`);
    pages.push(...fitPages([
      findingsSection('Body patterns', rest.filter(isBodyFinding), 2),
      { title: 'Where it shows up', rows: mapHtml ? [{ html: mapHtml, heightPt: BODY_MAP_HEIGHT_PT + 36 }] : [], empty: s.sites.empty },
      { ...s.episodes, minRows: 0 },
      { ...s.proximity, minRows: 0 },
      // Newest first, as built: those are the ones the appointment asks about.
      { ...s.events, minRows: 0 },
    ], undefined, 1).map(bodyHtml => ({ sectionTitle: 'Body', bodyHtml })));
  }

  return pages;
}
