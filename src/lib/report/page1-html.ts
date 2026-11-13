import { parseDateString } from '@/lib/date-utils';
import { flowPages, textHeightPt, type FlowSection } from '@/lib/report/flow-pages';
import { periodTrendArrow, periodTrendColor, windowLabel, type DomainTrends } from '@/lib/report/period-trend';
import {
  buildUnifiedFindings, domainDeviationColor, fmtVal, patternCardBgColor,
  patternCardColor, tierLabel, type UnifiedFinding, type UnifiedFindingsInput,
} from '@/lib/report/report-findings';
import { CONTENT_WIDTH, DOMAIN_LABELS, theme } from '@/lib/report/theme';
import type { PrepareQuestion } from '@/lib/supabase';

/** Stands in for Page 1's "Methodology on page N" until the document is
 *  assembled and N is known — see generate-report.ts. */
export const METHODOLOGY_PAGE_TOKEN = '%%METHODOLOGY_PAGE%%';

interface Page1Data extends UnifiedFindingsInput {
  userName?: string;
  dateFrom: string;
  dateTo: string;
  /** What the patient picked to report on — "Since appointment on 8 August
   *  2026", "Last 30 days". Printed at the top of the first page, because
   *  the dates alone don't say why the report starts where it does. */
  rangeLabel?: string;
  completedCheckIns: number;
  totalScheduled: number;
  trackedDomains: string[];
  baselineMap: Record<string, number>;
  trends: DomainTrends;
  questions: PrepareQuestion[];
  /** Page number of the Methodology page, or METHODOLOGY_PAGE_TOKEN. */
  methodologyPageNum?: number | string;
  /** Empty when body inclusion wasn't requested — the "Body domain summary"
   *  section renders nothing at all in that case, same as the report's
   *  other body-conditional content. */
  bodyTrackedDomains: string[];
  bodyBaselineMap: Record<string, number>;
  bodyTrends: DomainTrends;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFull(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daySpan(from: string, to: string): number {
  return Math.round((parseDateString(to).getTime() - parseDateString(from).getTime()) / 86400000) + 1;
}

// Shared by both the mind and body domain-summary tables — same
// active/stable split and row shape, just fed a different domain list/
// baseline map each time. `domainToFindingKind` is built once from the
// combined mind+body findings list, so a body domain's "active pattern"
// column resolves the same way a mind domain's already does.
//
// The trend column is worked out from the two columns beside it — the
// median of the period's first days against the median of its last — which
// are also the figures pattern evolution's "improving/worsening trend" is
// worded from. It used to compare a whole-period median labelled "current"
// against the all-time baseline, and could point down beside a caption
// reading "improving trend".
function buildDomainTableHtml(
  domains: string[],
  baselineMap: Record<string, number>,
  trends: DomainTrends,
  domainToFindingKind: Record<string, string>,
  colors: { gray: string; muted: string },
): string {
  const activeDomains = domains.filter(d => domainToFindingKind[d] != null);
  const stableDomains = domains.filter(d => domainToFindingKind[d] == null && d !== 'sleep');

  const rowsHtml = [
    ...activeDomains.map(domain => {
      const trend = trends.byDomain[domain];
      const baseline = baselineMap[domain];
      const color = domainDeviationColor(domain, trend?.recent, baseline);
      return `<tr>
        <td style="color:${color};">${esc(DOMAIN_LABELS[domain] ?? domain)}</td>
        <td class="center">${baseline != null ? fmtVal(baseline) : '-'}</td>
        <td class="center">${trend ? fmtVal(trend.earlier) : '-'}</td>
        <td class="center" style="color:${color}; font-weight:bold;">${trend ? fmtVal(trend.recent) : '-'}</td>
        <td class="center" style="color:${periodTrendColor(domain, trend)}; font-weight:bold;">${periodTrendArrow(trend)}</td>
        <td style="color:${colors.muted};">${esc(domainToFindingKind[domain] ?? '')}</td>
      </tr>`;
    }),
    ...stableDomains.map(domain => {
      const trend = trends.byDomain[domain];
      const baseline = baselineMap[domain];
      return `<tr class="stable">
        <td style="color:${colors.gray};">${esc(DOMAIN_LABELS[domain] ?? domain)}</td>
        <td class="center">${baseline != null ? fmtVal(baseline) : '-'}</td>
        <td class="center">${trend ? fmtVal(trend.earlier) : '-'}</td>
        <td class="center">${trend ? fmtVal(trend.recent) : '-'}</td>
        <td class="center" style="color:${periodTrendColor(domain, trend)};">${periodTrendArrow(trend)}</td>
        <td style="color:${colors.gray}; font-style:italic;">No pattern detected</td>
      </tr>`;
    }),
  ].join('');

  if (activeDomains.length === 0 && stableDomains.length === 0) {
    return `<p class="empty-muted">No tracked domains in this window.</p>`;
  }
  const first = trends.windowDays > 0 ? windowLabel('first', trends.windowDays) : 'Earlier';
  const last = trends.windowDays > 0 ? windowLabel('last', trends.windowDays) : 'Recent';
  return `<table class="domain-table">
      <thead><tr><th>Domain</th><th class="center">Baseline</th><th class="center">${esc(first)}</th><th class="center">${esc(last)}</th><th class="center">Trend</th><th>Active pattern</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

const TOP_FINDINGS = 3;

function patternCardHtml(f: UnifiedFinding): string {
  return `
      <div class="pattern-card">
        <div class="pattern-card-border" style="background:${patternCardColor(f.tier)};"></div>
        <div class="pattern-card-body" style="background:${patternCardBgColor(f.tier)};">
          <div class="pattern-card-title-row">
            <span class="pattern-card-title">${esc(f.headline)}</span>
            <span class="pattern-card-tier" style="color:${patternCardColor(f.tier)};">${tierLabel(f.tier)}</span>
          </div>
          <div class="pattern-card-stat">(${esc(f.statLine)})</div>
        </div>
      </div>`;
}

/** One line per finding, for the ones past the top three. */
function findingRowHtml(f: UnifiedFinding): string {
  return `
      <div class="finding-row">
        <span class="dot" style="background:${patternCardColor(f.tier)};"></span>
        <span class="finding-text"><strong>${esc(f.headline)}</strong> <span class="finding-stat">(${esc(f.statLine)})</span></span>
        <span class="finding-tier" style="color:${patternCardColor(f.tier)};">${tierLabel(f.tier)}</span>
      </div>`;
}

// Builds Page 1's (Executive Summary) content — the RN port's replacement
// for Page1Summary.tsx. Returns one body per sheet: the three strongest
// patterns get cards, the patient's questions follow, then every other
// pattern detected, one line each — all of them, onto a continuation page
// if they need one. This used to stop at three and say "18 additional
// lower-confidence patterns not shown here".
export function buildPage1Pages(data: Page1Data): string[] {
  const { colors } = theme;
  const {
    userName, dateFrom, dateTo, rangeLabel, completedCheckIns, totalScheduled,
    questions, methodologyPageNum,
  } = data;

  const pct = totalScheduled > 0 ? Math.round((completedCheckIns / totalScheduled) * 100) : 0;

  // buildUnifiedFindings has no mind/body distinction of its own — it just
  // labels whatever domain key each input carries via DOMAIN_LABELS (which
  // covers body domains too, see theme.ts).
  const allFindings = buildUnifiedFindings(data);
  const topFindings = allFindings.slice(0, TOP_FINDINGS);
  const otherFindings = allFindings.slice(TOP_FINDINGS);

  const lead = {
    html: `
    <div class="name-row"><span class="patient-name">${esc(userName ?? 'Patient')}</span></div>
    ${rangeLabel ? `<p class="report-period">Report period: ${esc(rangeLabel)}</p>` : ''}
    <p class="subtitle">${esc(fmtFull(dateFrom))} - ${esc(fmtFull(dateTo))} (${daySpan(dateFrom, dateTo)} days)</p>

    <div class="completion-line">
      <span>${completedCheckIns} of ${totalScheduled} check-ins completed (${pct}%) this period</span>
      ${methodologyPageNum != null ? `<span style="color:${colors.muted};">Methodology on page ${methodologyPageNum}</span>` : ''}
    </div>`,
    heightPt: 82 + (rangeLabel ? 18 : 0),
  };

  const confidenceKey = {
    html: `
    <div class="confidence-key">
      <span><span class="dot" style="background:${patternCardColor('high')};"></span>Firm - enough data to stand on</span>
      <span><span class="dot" style="background:${patternCardColor('moderate')};"></span>Partial - worth watching</span>
      <span><span class="dot" style="background:${patternCardColor('early')};"></span>Early signal - limited coverage</span>
    </div>`,
    heightPt: 16,
  };

  const topSection: FlowSection = {
    title: 'Patterns detected this period',
    rows: topFindings.map(f => ({
      html: patternCardHtml(f),
      heightPt: 14 + textHeightPt(f.headline, theme.fontSize.label, CONTENT_WIDTH - 70) + textHeightPt(`(${f.statLine})`, theme.fontSize.small, CONTENT_WIDTH - 20),
    })),
    open: topFindings.length > 0 ? confidenceKey : undefined,
    empty: { html: `<p class="empty-muted">No patterns above confidence threshold this period.</p>`, heightPt: 16 },
  };

  const questionsSection: FlowSection = {
    title: 'Patient wants to discuss',
    rows: questions.map((q, i) => ({
      html: `
        <div class="discuss-item">
          <span class="discuss-bullet">${i + 1}</span>
          <span class="discuss-text">${esc(q.question_text)}</span>
        </div>`,
      heightPt: Math.max(16, textHeightPt(q.question_text, theme.fontSize.body, CONTENT_WIDTH - 30)) + 3,
    })),
  };

  const othersSection: FlowSection = {
    title: 'Other patterns detected this period',
    rows: otherFindings.map(f => ({
      html: findingRowHtml(f),
      heightPt: textHeightPt(`${f.headline} (${f.statLine})`, theme.fontSize.small, CONTENT_WIDTH - 70) + 5,
    })),
    open: otherFindings.length > 0 && topFindings.length === 0 ? confidenceKey : undefined,
  };

  return flowPages([topSection, questionsSection, othersSection], lead);
}

/**
 * Every tracked domain against its own baseline, as its own page.
 *
 * These two tables used to sit on the executive summary. Seventeen rows of
 * them, for someone tracking mind and body, on the page that is supposed to
 * answer "what should we talk about today" — so they have a page here, with
 * every row.
 */
export function buildDomainSummaryHtml(data: Page1Data): string {
  const {
    trackedDomains, baselineMap, trends,
    bodyTrackedDomains, bodyBaselineMap, bodyTrends,
  } = data;
  const { colors } = theme;

  const allFindings = buildUnifiedFindings(data);
  const domainToFindingKind: Record<string, string> = {};
  for (const f of allFindings) {
    for (const d of f.domains) {
      if (!domainToFindingKind[d]) domainToFindingKind[d] = f.kind;
    }
  }

  return `
    <div class="section-gap">
      <p class="section-label">Mind domain summary</p>
      ${buildDomainTableHtml(trackedDomains, baselineMap, trends, domainToFindingKind, colors)}
    </div>

    ${bodyTrackedDomains.length > 0 ? `
    <div class="section-gap">
      <p class="section-label">Body domain summary</p>
      ${buildDomainTableHtml(bodyTrackedDomains, bodyBaselineMap, bodyTrends, domainToFindingKind, colors)}
    </div>` : ''}

    <div class="explainer-box">
      <p class="explainer-title">Reading these tables</p>
      <p class="explainer-text">Each domain is compared against this patient's own rolling baseline, never a population norm. A domain sitting at its baseline is typical for them, which is not the same as being unremarkable in absolute terms. The trend arrow compares the two medians beside it: the period's first days against its last. It shows which way the score moved, and its colour whether that is better (green) or worse (red) for this domain.</p>
    </div>
  `;
}
