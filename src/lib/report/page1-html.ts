import { parseDateString } from '@/lib/date-utils';
import {
  buildUnifiedFindings, domainDeviationColor, fmtVal, patternCardBgColor,
  patternCardColor, tierLabel, trendArrow, type UnifiedFindingsInput,
} from '@/lib/report/report-findings';
import { DOMAIN_LABELS, theme } from '@/lib/report/theme';
import type { PrepareQuestion } from '@/lib/supabase';

interface Page1Data extends UnifiedFindingsInput {
  userName?: string;
  dateFrom: string;
  dateTo: string;
  completedCheckIns: number;
  totalScheduled: number;
  trackedDomains: string[];
  baselineMap: Record<string, number>;
  currentRollingMedians: Record<string, number>;
  questions: PrepareQuestion[];
  /** Page number of the Data Quality & Methodology page — omitted (no
   *  footnote shown) until that page exists. */
  methodologyPageNum?: number;
  /** Empty when body inclusion wasn't requested — the "Body domain summary"
   *  section renders nothing at all in that case, same as the report's
   *  other body-conditional content. */
  bodyTrackedDomains: string[];
  bodyBaselineMap: Record<string, number>;
  bodyCurrentRollingMedians: Record<string, number>;
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
function buildDomainTableHtml(
  domains: string[],
  baselineMap: Record<string, number>,
  currentRollingMedians: Record<string, number>,
  domainToFindingKind: Record<string, string>,
  colors: { gray: string; muted: string },
): string {
  const activeDomains = domains.filter(d => domainToFindingKind[d] != null);
  const stableDomains = domains.filter(d => domainToFindingKind[d] == null && d !== 'sleep');

  const rowsHtml = [
    ...activeDomains.map(domain => {
      const current = currentRollingMedians[domain];
      const baseline = baselineMap[domain];
      const color = domainDeviationColor(domain, current, baseline);
      return `<tr>
        <td style="color:${color};">${esc(DOMAIN_LABELS[domain] ?? domain)}</td>
        <td class="center">${baseline != null ? fmtVal(baseline) : '-'}</td>
        <td class="center" style="color:${color}; font-weight:bold;">${current != null ? fmtVal(current) : '-'}</td>
        <td class="center" style="color:${color}; font-weight:bold;">${trendArrow(current, baseline)}</td>
        <td style="color:${colors.muted};">${esc(domainToFindingKind[domain] ?? '')}</td>
      </tr>`;
    }),
    ...stableDomains.map(domain => {
      const current = currentRollingMedians[domain];
      const baseline = baselineMap[domain];
      return `<tr class="stable">
        <td style="color:${colors.gray};">${esc(DOMAIN_LABELS[domain] ?? domain)}</td>
        <td class="center">${baseline != null ? fmtVal(baseline) : '-'}</td>
        <td class="center">${current != null ? fmtVal(current) : '-'}</td>
        <td class="center" style="color:${colors.gray};">${trendArrow(current, baseline)}</td>
        <td style="color:${colors.gray}; font-style:italic;">Within baseline range</td>
      </tr>`;
    }),
  ].join('');

  if (activeDomains.length === 0 && stableDomains.length === 0) {
    return `<p class="empty-muted">No tracked domains in this window.</p>`;
  }
  return `<table class="domain-table">
      <thead><tr><th>Domain</th><th class="center">Baseline</th><th class="center">Current</th><th class="center">Trend</th><th>Active pattern</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

// Builds Page 1's (Executive Summary) body content — the RN port's
// replacement for Page1Summary.tsx, as an HTML fragment (expo-print takes
// one HTML string for the whole report; report-document.ts wraps this in
// the shared page header/footer/stylesheet, same as every other page).
export function buildPage1BodyHtml(data: Page1Data): string {
  const { colors } = theme;
  const {
    userName, dateFrom, dateTo, completedCheckIns, totalScheduled,
    trackedDomains, baselineMap, currentRollingMedians, questions, methodologyPageNum,
    bodyTrackedDomains, bodyBaselineMap, bodyCurrentRollingMedians,
  } = data;

  const pct = totalScheduled > 0 ? Math.round((completedCheckIns / totalScheduled) * 100) : 0;
  const topQuestions = questions.slice(0, 3);

  // buildUnifiedFindings has no mind/body distinction of its own — it just
  // labels whatever domain key each input carries via DOMAIN_LABELS (which
  // covers body domains too, see theme.ts). Passing data.flaggedClusters/
  // dayOfWeekPatterns/lagRelationships/interventionImpacts already merged
  // with body (see generate-report.ts) is what makes this ranking body-aware
  // — no changes needed in report-findings.ts itself.
  const allFindings = buildUnifiedFindings(data);
  const topFindings = allFindings.slice(0, 3);
  const extraCount = Math.max(0, allFindings.length - 3);

  const domainToFindingKind: Record<string, string> = {};
  for (const f of allFindings) {
    for (const d of f.domains) {
      if (!domainToFindingKind[d]) domainToFindingKind[d] = f.kind;
    }
  }
  const domainTableHtml = buildDomainTableHtml(trackedDomains, baselineMap, currentRollingMedians, domainToFindingKind, colors);
  const bodyDomainTableHtml = bodyTrackedDomains.length > 0
    ? buildDomainTableHtml(bodyTrackedDomains, bodyBaselineMap, bodyCurrentRollingMedians, domainToFindingKind, colors)
    : null;

  const confidenceKeyHtml = topFindings.length === 0 ? '' : `
    <div class="confidence-key">
      <span><span class="dot" style="background:${patternCardColor('high')};"></span>Firm - enough data to stand on</span>
      <span><span class="dot" style="background:${patternCardColor('moderate')};"></span>Partial - worth watching</span>
      <span><span class="dot" style="background:${patternCardColor('early')};"></span>Early signal - limited coverage</span>
    </div>`;

  const patternCardsHtml = topFindings.length === 0
    ? `<p class="empty-muted">No patterns above confidence threshold this period.</p>`
    : topFindings.map(f => `
      <div class="pattern-card">
        <div class="pattern-card-border" style="background:${patternCardColor(f.tier)};"></div>
        <div class="pattern-card-body" style="background:${patternCardBgColor(f.tier)};">
          <div class="pattern-card-title-row">
            <span class="pattern-card-title">${esc(f.headline)}</span>
            <span class="pattern-card-tier" style="color:${patternCardColor(f.tier)};">${tierLabel(f.tier)}</span>
          </div>
          <div class="pattern-card-stat">(${esc(f.statLine)})</div>
        </div>
      </div>`).join('');

  const overflowNoteHtml = extraCount > 0
    ? `<p class="overflow-note">${extraCount} additional lower-confidence pattern${extraCount !== 1 ? 's' : ''} not shown here.</p>`
    : '';

  const questionsHtml = topQuestions.length === 0 ? '' : `
    <div class="section-gap">
      <p class="section-label">Patient wants to discuss</p>
      ${topQuestions.map((q, i) => `
        <div class="discuss-item">
          <span class="discuss-bullet">${i + 1}</span>
          <span class="discuss-text">${esc(q.question_text)}</span>
        </div>`).join('')}
    </div>`;

  return `
    <div class="name-row"><span class="patient-name">${esc(userName ?? 'Patient')}</span></div>
    <p class="subtitle">${esc(fmtFull(dateFrom))} - ${esc(fmtFull(dateTo))} (${daySpan(dateFrom, dateTo)} days)</p>

    <div class="completion-line">
      <span>${completedCheckIns} of ${totalScheduled} check-ins completed (${pct}%) this period</span>
      ${methodologyPageNum != null ? `<span style="color:${colors.muted};">Methodology on page ${methodologyPageNum}</span>` : ''}
    </div>

    <div class="section-gap">
      <p class="section-label">Mind domain summary</p>
      ${domainTableHtml}
    </div>

    ${bodyDomainTableHtml != null ? `
    <div class="section-gap">
      <p class="section-label">Body domain summary</p>
      ${bodyDomainTableHtml}
    </div>` : ''}

    <div class="section-gap">
      <p class="section-label">Patterns detected this period</p>
      ${confidenceKeyHtml}
      ${patternCardsHtml}
      ${overflowNoteHtml}
    </div>

    ${questionsHtml}
  `;
}
