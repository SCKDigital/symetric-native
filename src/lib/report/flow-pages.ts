import { CONTENT_WIDTH, theme } from '@/lib/report/theme';

// Splits a page's lists across as many numbered pages as they need.
//
// Every list in this report used to be capped — three timeline entries,
// three rare events, eight notes, two body events — with "N not shown"
// beneath. That kept each logical page on one sheet, which matters: the
// header's "Page 3 of 8" is written into the HTML, so a page that overflows
// spills onto a sheet with no header and a number that is now wrong. But a
// report a patient generated for a stated period has to show that period,
// all of it: the entries left out were exactly the ones a clinician asks
// about.
//
// So lists are no longer capped; they are paginated. A page builder describes
// its content as sections of rows, each with an estimated height, and this
// lays them down until the next row would not fit, then starts a new page
// with the section's heading marked "(continued)". The estimates are
// deliberately generous — a page that ends early costs some white space, a
// page that overflows costs the numbering — and are checked against a real
// engine by scripts/report-layout/measure-report.mjs, which must still pass.

/** Body height available on a sheet, in pt: the 504pt printable height less
 *  the shared page header and footer, less a margin for estimate error.
 *  Fitted with scripts/report-layout/measure-report.mjs — re-run it before
 *  changing this. */
export const PAGE_BODY_BUDGET_PT = 425;

export interface FlowRow {
  html: string;
  heightPt: number;
}

export interface FlowSection {
  /** Plain-text heading. Rendered as the page's usual section label, with
   *  "(continued)" appended when the section resumes on a new page. Without
   *  one the rows simply follow on (trailing notes, an explainer box). */
  title?: string;
  /** Optional text right-aligned on the heading row (a date range). */
  titleAside?: string;
  rows: FlowRow[];
  /** Opens a wrapper the rows sit inside — a table and its header row —
   *  repeated at the top of each page the section resumes on. */
  open?: FlowRow;
  close?: string;
  /** Follows the last row, kept on the same page as it. */
  footer?: FlowRow;
  /** Rendered in place of the rows when there are none. Without it a
   *  section with no rows is left out entirely. */
  empty?: FlowRow;
}

const SECTION_GAP_PT = 9;
// A section label renders 12.8–16.5pt plus its 3pt margin (measured, Noto Sans).
const HEADING_PT = 18;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function headingHtml(section: FlowSection, continued: boolean): string {
  if (!section.title) return '';
  const title = `${esc(section.title)}${continued ? ' (continued)' : ''}`;
  if (section.titleAside) {
    return `<div class="section-label-row"><p class="section-label">${title}</p><span class="section-label-dates">${esc(section.titleAside)}</span></div>`;
  }
  return `<p class="section-label">${title}</p>`;
}

/**
 * Lays `lead` (fixed content that opens the first page) and then each
 * section down, page by page. Always returns at least one page.
 */
export function flowPages(sections: FlowSection[], lead?: FlowRow, budgetPt: number = PAGE_BODY_BUDGET_PT): string[] {
  const pages: string[] = [];
  let parts: string[] = [];
  let used = 0;

  if (lead && lead.html.trim()) {
    parts.push(lead.html);
    used += lead.heightPt;
  }

  const flush = () => {
    pages.push(parts.join(''));
    parts = [];
    used = 0;
  };

  for (const section of sections) {
    const rows = section.rows.length > 0 ? section.rows : section.empty ? [section.empty] : [];
    if (rows.length === 0) continue;
    const isEmptyState = section.rows.length === 0;
    const open = isEmptyState ? undefined : section.open;
    const close = isEmptyState ? '' : (section.close ?? '');

    let started = false; // has any of this section been placed yet
    let onPage = false; // is it open on the current page

    const footerPt = section.footer?.heightPt ?? 0;
    // Height of rows i and i+1 together, with the footer if i+1 is the last.
    const pairPt = (i: number) => rows[i].heightPt + rows[i + 1].heightPt + (i + 1 === rows.length - 1 ? footerPt : 0);

    rows.forEach((row, i) => {
      const isLast = i === rows.length - 1;
      const headingPt = section.title ? HEADING_PT : 0;
      const headerCost = onPage ? 0 : headingPt + (open?.heightPt ?? 0);
      const footerCost = isLast ? footerPt : 0;
      let need = headerCost + row.heightPt + footerCost;
      // No lone rows. A section doesn't open at the foot of a sheet with one
      // row under its heading, and doesn't carry its last row alone onto a
      // fresh sheet: either way the pair moves together.
      if (rows.length >= 2 && !isLast && (!onPage || i === rows.length - 2)) {
        need = Math.max(need, headerCost + pairPt(i));
      }

      if (used > 0 && used + need > budgetPt) {
        if (onPage) parts.push(`${close}</div>`);
        flush();
        onPage = false;
      }
      if (!onPage) {
        parts.push(`<div class="section-gap">${headingHtml(section, started)}${open?.html ?? ''}`);
        used += headingPt + (open?.heightPt ?? 0);
        onPage = true;
        started = true;
      }
      parts.push(row.html);
      used += row.heightPt;
    });

    parts.push(close);
    if (section.footer) {
      parts.push(section.footer.html);
      used += section.footer.heightPt;
    }
    parts.push('</div>');
    used += SECTION_GAP_PT;
  }

  if (parts.length > 0 || pages.length === 0) flush();
  return pages;
}

// ── Height estimates ────────────────────────────────────────────────────────
// Generous on purpose. Average glyph width is taken as 0.56em (Noto Sans, the
// wider of the two fonts the layout check runs under, averages about 0.53em
// on English prose) and line height as 1.4 (Noto Sans's "normal" is 1.36).

const EM_PER_CHAR = 0.56;
const LINE_HEIGHT = 1.4;

/** Lines `text` wraps to at `fontPt` in a box `widthPt` wide. */
export function lineCount(text: string, fontPt: number, widthPt: number): number {
  const perLine = Math.max(1, Math.floor(widthPt / (fontPt * EM_PER_CHAR)));
  let lines = 0;
  for (const para of text.split('\n')) {
    // Word-wrap: a word that does not fit on the current line starts the next.
    let col = 0;
    let paraLines = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (col === 0) { col = len; continue; }
      if (col + 1 + len > perLine) { paraLines += 1 + Math.floor(len / perLine); col = len % perLine; }
      else col += 1 + len;
    }
    lines += paraLines;
  }
  return Math.max(1, lines);
}

/** Height of `text` wrapped at `fontPt` in a box `widthPt` wide. */
export function textHeightPt(text: string, fontPt: number = theme.fontSize.small, widthPt: number = CONTENT_WIDTH): number {
  return lineCount(text, fontPt, widthPt) * fontPt * LINE_HEIGHT;
}
