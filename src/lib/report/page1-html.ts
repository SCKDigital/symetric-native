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
  generationDate: string;
  completedCheckIns: number;
  totalScheduled: number;
  trackedDomains: string[];
  baselineMap: Record<string, number>;
  currentRollingMedians: Record<string, number>;
  questions: PrepareQuestion[];
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

// Builds the full HTML document for Page 1 (Executive Summary) — the RN
// port's replacement for Page1Summary.tsx + PageHeader/PageFooter, as a
// plain HTML string (expo-print takes HTML, not a @react-pdf/renderer
// component tree). Every pt value below is the exact number from
// lib/report/theme.ts with a `pt` unit appended, so layout stays
// equivalent to the web report's page geometry.
export function buildPage1Html(data: Page1Data): string {
  const { colors, fontSize } = theme;
  const {
    userName, dateFrom, dateTo, generationDate, completedCheckIns, totalScheduled,
    trackedDomains, baselineMap, currentRollingMedians, questions,
  } = data;

  const pct = totalScheduled > 0 ? Math.round((completedCheckIns / totalScheduled) * 100) : 0;
  const topQuestions = questions.slice(0, 3);

  const allFindings = buildUnifiedFindings(data);
  const topFindings = allFindings.slice(0, 3);
  const extraCount = Math.max(0, allFindings.length - 3);

  const domainToFindingKind: Record<string, string> = {};
  for (const f of allFindings) {
    for (const d of f.domains) {
      if (!domainToFindingKind[d]) domainToFindingKind[d] = f.kind;
    }
  }
  const activeDomains = trackedDomains.filter(d => domainToFindingKind[d] != null);
  const stableDomains = trackedDomains.filter(d => domainToFindingKind[d] == null && d !== 'sleep');

  const domainRowsHtml = [
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

  const domainTableHtml = activeDomains.length === 0 && stableDomains.length === 0
    ? `<p class="empty-muted">No tracked domains in this window.</p>`
    : `<table class="domain-table">
        <thead><tr><th>Domain</th><th class="center">Baseline</th><th class="center">Current</th><th class="center">Trend</th><th>Active pattern</th></tr></thead>
        <tbody>${domainRowsHtml}</tbody>
      </table>`;

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

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: letter; margin: ${theme.spacing.page.top}pt ${theme.spacing.page.right}pt ${theme.spacing.page.bottom}pt ${theme.spacing.page.left}pt; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: ${fontSize.body}pt; color: ${colors.body}; margin: 0; }
  .name-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; }
  .patient-name { font-weight: bold; font-size: ${fontSize.patientName}pt; color: ${colors.heading}; }
  .subtitle { font-size: ${fontSize.label}pt; color: ${colors.muted}; margin: 0 0 8pt; }
  .section-label { font-weight: bold; font-size: ${fontSize.sectionHeading}pt; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.7pt; padding-bottom: 3pt; margin: 0 0 3pt; border-bottom: 0.5pt solid ${colors.border}; }
  .section-gap { margin-bottom: 14pt; }
  .empty-muted { font-style: italic; font-size: ${fontSize.small}pt; color: ${colors.muted}; margin: 0 0 6pt; }
  .overflow-note { font-style: italic; font-size: ${fontSize.small}pt; color: ${colors.muted}; margin: 1pt 0 4pt; }
  .completion-line { display: flex; justify-content: space-between; padding-bottom: 6pt; margin-bottom: 8pt; border-bottom: 0.5pt solid ${colors.border}; font-size: ${fontSize.small}pt; color: ${colors.muted}; }
  .domain-table { width: 100%; border-collapse: collapse; }
  .domain-table th { text-align: left; font-weight: bold; font-size: 7pt; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1pt solid ${colors.heading}; padding-bottom: 2pt; }
  .domain-table td { font-size: ${fontSize.small}pt; padding: 2pt 4pt 2pt 0; border-bottom: 0.5pt solid ${colors.border}; }
  .domain-table tr.stable td { background: #FAFAFA; }
  .center { text-align: center; }
  .confidence-key { display: flex; gap: 12pt; margin-bottom: 4pt; font-size: ${fontSize.small}pt; color: ${colors.muted}; }
  .confidence-key .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 1.5pt; margin-right: 4pt; }
  .pattern-card { display: flex; margin-bottom: 4pt; border-radius: 2pt; overflow: hidden; }
  .pattern-card-border { width: 3pt; flex-shrink: 0; }
  .pattern-card-body { flex: 1; padding: 4pt 8pt; border: 0.5pt solid ${colors.border}; border-left: none; }
  .pattern-card-title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 6pt; margin-bottom: 2pt; }
  .pattern-card-title { font-weight: bold; font-size: ${fontSize.label}pt; color: ${colors.heading}; }
  .pattern-card-tier { font-weight: bold; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.4pt; flex-shrink: 0; }
  .pattern-card-stat { font-size: ${fontSize.small}pt; color: ${colors.muted}; line-height: 1.35; }
  .discuss-item { display: flex; align-items: flex-start; gap: 8pt; margin-bottom: 3pt; }
  .discuss-bullet { display: inline-flex; align-items: center; justify-content: center; width: 16pt; height: 16pt; border-radius: 8pt; background: ${colors.heading}; color: #fff; font-weight: bold; font-size: 7pt; flex-shrink: 0; }
  .discuss-text { flex: 1; font-size: ${fontSize.body}pt; color: ${colors.heading}; line-height: 1.4; }
  .page-header { display: flex; justify-content: space-between; align-items: baseline; }
  .page-header-left { display: flex; align-items: baseline; gap: 6pt; }
  .logo { font-weight: bold; font-size: ${fontSize.pageTitle}pt; color: ${colors.heading}; letter-spacing: 1pt; }
  .section-title { font-size: ${fontSize.pageTitle}pt; color: ${colors.muted}; }
  .header-meta { font-size: ${fontSize.small}pt; color: ${colors.muted}; }
  .header-rule { border-bottom: 1pt solid ${colors.heading}; margin: 5pt 0 12pt; }
  .footer { display: flex; justify-content: space-between; align-items: center; border-top: 0.5pt solid ${colors.border}; padding-top: 5pt; margin-top: 24pt; font-size: ${fontSize.footer}pt; color: ${colors.muted}; }
  .footer-right { font-style: italic; text-align: right; }
</style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-left"><span class="logo">SYMETRIC</span><span style="color:${colors.border};">&middot;</span><span class="section-title">Executive Summary</span></div>
    <span class="header-meta">Page 1 of 1 &middot; ${esc(generationDate)}</span>
  </div>
  <div class="header-rule"></div>

  <div class="name-row"><span class="patient-name">${esc(userName ?? 'Patient')}</span></div>
  <p class="subtitle">${esc(fmtFull(dateFrom))} - ${esc(fmtFull(dateTo))} (${daySpan(dateFrom, dateTo)} days)</p>

  <div class="completion-line">
    <span>${completedCheckIns} of ${totalScheduled} check-ins completed (${pct}%) this period</span>
  </div>

  <div class="section-gap">
    <p class="section-label">Mind domain summary</p>
    ${domainTableHtml}
  </div>

  <div class="section-gap">
    <p class="section-label">Patterns detected this period</p>
    ${confidenceKeyHtml}
    ${patternCardsHtml}
    ${overflowNoteHtml}
  </div>

  ${questionsHtml}

  <div class="footer">
    <span>${esc(fmtFull(dateFrom))} - ${esc(fmtFull(dateTo))}</span>
    <span class="footer-right">Self-report data &middot; on-device processing &middot; correlation is not causation</span>
  </div>
</body>
</html>`;
}
