import { theme } from '@/lib/report/theme';

// Shared HTML/CSS scaffolding for the whole report — the RN equivalent of
// SymetricReport.tsx (the <Document>/<Page> wrapper) plus PageHeader.tsx/
// PageFooter.tsx, combined into one module since expo-print takes a single
// HTML string for the entire PDF (not a per-page component tree the way
// @react-pdf/renderer's <Document> composes <Page> children). Each
// buildPageNHtml() function returns just its own body content; this module
// wraps every page's content in a shared header/footer and page-break CSS.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ReportPage {
  sectionTitle: string;
  bodyHtml: string;
}

function buildPageHeaderHtml(generationDate: string, pageNumber: number, totalPages: number, sectionTitle: string): string {
  return `<div class="page-header">
    <div class="page-header-left"><span class="logo">SYMETRIC</span><span class="header-sep">&middot;</span><span class="section-title">${esc(sectionTitle)}</span></div>
    <span class="header-meta">Page ${pageNumber} of ${totalPages} &middot; ${esc(generationDate)}</span>
  </div>
  <div class="header-rule"></div>`;
}

function buildPageFooterHtml(dateFrom: string, dateTo: string, fmtShort: (d: string) => string, rightText?: string): string {
  return `<div class="footer">
    <span>${esc(fmtShort(dateFrom))} - ${esc(fmtShort(dateTo))}</span>
    <span class="footer-right">${esc(rightText ?? 'Self-report data · on-device processing · correlation is not causation')}</span>
  </div>`;
}

export function buildReportDocument(params: {
  pages: ReportPage[];
  generationDate: string;
  dateFrom: string;
  dateTo: string;
}): string {
  const { pages, generationDate, dateFrom, dateTo } = params;
  const totalPages = pages.length;
  const fmtShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const { colors, fontSize } = theme;

  const pagesHtml = pages.map((p, i) => `
    <div class="page">
      ${buildPageHeaderHtml(generationDate, i + 1, totalPages, p.sectionTitle)}
      ${p.bodyHtml}
      ${buildPageFooterHtml(dateFrom, dateTo, fmtShort)}
    </div>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: letter; margin: ${theme.spacing.page.top}pt ${theme.spacing.page.right}pt ${theme.spacing.page.bottom}pt ${theme.spacing.page.left}pt; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: ${fontSize.body}pt; color: ${colors.body}; margin: 0; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  .page-header { display: flex; justify-content: space-between; align-items: baseline; }
  .page-header-left { display: flex; align-items: baseline; gap: 6pt; }
  .logo { font-weight: bold; font-size: ${fontSize.pageTitle}pt; color: ${colors.heading}; letter-spacing: 1pt; }
  .header-sep { color: ${colors.border}; }
  .section-title { font-size: ${fontSize.pageTitle}pt; color: ${colors.muted}; }
  .header-meta { font-size: ${fontSize.small}pt; color: ${colors.muted}; }
  .header-rule { border-bottom: 1pt solid ${colors.heading}; margin: 5pt 0 12pt; }

  .footer { display: flex; justify-content: space-between; align-items: center; border-top: 0.5pt solid ${colors.border}; padding-top: 5pt; margin-top: 24pt; font-size: ${fontSize.footer}pt; color: ${colors.muted}; }
  .footer-right { font-style: italic; text-align: right; }

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

  .sleep-row { display: flex; gap: 8pt; margin-bottom: 4pt; }
  .sleep-label { width: 120pt; font-weight: bold; font-size: ${fontSize.small}pt; color: ${colors.heading}; flex-shrink: 0; }
  .sleep-value { font-size: ${fontSize.small}pt; color: ${colors.body}; flex: 1; }
  .sleep-note { font-style: italic; font-size: ${fontSize.small}pt; color: ${colors.muted}; line-height: 1.4; margin-top: 2pt; }

  .spark-stack { position: relative; margin-bottom: 2pt; }
  .spark-cell { margin-bottom: 3pt; }
  .spark-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; font-size: ${fontSize.label}pt; }
  .spark-meta { font-size: 7pt; color: ${colors.muted}; }
  .spark-no-data { width: 100%; height: 18pt; background: #F9FAFB; display: flex; align-items: center; justify-content: center; font-style: italic; font-size: 7pt; color: ${colors.muted}; }
  .marker-line { position: absolute; top: 0; bottom: 0; width: 0.75pt; background: ${colors.teal}; opacity: 0.5; }
  .marker-number { position: absolute; bottom: -8pt; width: 11pt; margin-left: -5.5pt; text-align: center; font-weight: bold; font-size: 6.5pt; color: ${colors.teal}; }

  .timeline-row { display: flex; align-items: flex-start; margin-bottom: 2pt; }
  .timeline-dot-square { width: 8pt; height: 8pt; border-radius: 1pt; opacity: 0.7; margin-top: 1pt; margin-right: 6pt; flex-shrink: 0; display: inline-block; }
  .timeline-dot-circle { width: 8pt; height: 8pt; border-radius: 4pt; background: ${colors.teal}; opacity: 0.7; margin-top: 1pt; margin-right: 6pt; flex-shrink: 0; display: inline-block; }
  .timeline-dot-numbered { width: 10pt; height: 10pt; border-radius: 5pt; background: ${colors.teal}; color: #fff; display: inline-flex; align-items: center; justify-content: center; margin-right: 6pt; flex-shrink: 0; font-weight: bold; font-size: 6pt; }
  .timeline-text { font-size: ${fontSize.small}pt; color: ${colors.body}; flex: 1; }
  .impact-line { font-style: italic; font-size: ${fontSize.small}pt; color: ${colors.muted}; margin: 0 0 3pt 14pt; }

  .rare-row { border-bottom: 0.5pt solid ${colors.border}; padding: 2pt 0; }
  .rare-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; }
  .rare-title { font-weight: bold; font-size: ${fontSize.label}pt; color: ${colors.heading}; }
  .rare-meta { font-size: ${fontSize.small}pt; color: ${colors.muted}; }
  .rare-body { font-size: ${fontSize.small}pt; color: ${colors.body}; line-height: 1.4; margin: 0 0 2pt; }

  .explainer-box { border-left: 2pt solid ${colors.border}; padding: 6pt 0 6pt 8pt; margin-top: 8pt; }
  .explainer-title { font-weight: bold; font-size: ${fontSize.small}pt; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.5pt; margin: 0 0 3pt; }
  .explainer-text { font-size: ${fontSize.small}pt; color: ${colors.muted}; line-height: 1.45; margin: 0; }

  .completion-table { width: 100%; border-collapse: collapse; }
  .completion-table th { text-align: left; font-weight: bold; font-size: 7pt; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1pt solid ${colors.heading}; padding-bottom: 3pt; }
  .completion-table td { font-size: ${fontSize.small}pt; padding: 4pt 0; border-bottom: 0.5pt solid ${colors.border}; }
  .col-week { width: 100pt; color: ${colors.heading}; }
  .col-sched, .col-comp { width: 70pt; text-align: center; color: ${colors.muted}; }
  .completion-table td.col-comp { color: ${colors.body}; }
  .col-pct { width: 60pt; text-align: right; font-weight: bold; }
  .col-note { font-style: italic; font-size: 7pt; color: ${colors.muted}; padding-left: 8pt; }

  .callout-box { border-left: 2pt solid ${colors.amber}; background: ${colors.amberBg}; padding: 5pt 0 5pt 8pt; margin-bottom: 12pt; }
  .callout-text { font-size: ${fontSize.small}pt; color: ${colors.amber}; line-height: 1.4; margin: 0; }

  .meth-text { font-size: ${fontSize.small}pt; color: ${colors.muted}; line-height: 1.55; margin: 0 0 8pt; }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;
}
