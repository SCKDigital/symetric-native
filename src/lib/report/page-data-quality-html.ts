import type { WeeklyCompletion } from '@/lib/report/weekly-completion';
import { TIME_BLOCK_LABELS, type MissedByTimeOfDay, type OneTapSummary } from '@/lib/report/how-collected';

const LOW_COMPLETION_THRESHOLD = 60; // % - weeks below this get a callout

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmtD = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const fmtE = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmtD} - ${fmtE}`;
}

function buildCompletionTableHtml(weeks: WeeklyCompletion[]): string {
  if (weeks.length === 0) return `<p class="empty-muted">No check-in data for this window.</p>`;

  const rows = weeks.map(w => {
    const low = w.pct < LOW_COMPLETION_THRESHOLD && w.scheduled > 0;
    return `<tr>
      <td class="col-week">${esc(fmtWeekStart(w.weekStart))}</td>
      <td class="col-sched">${w.scheduled}</td>
      <td class="col-comp">${w.completed}</td>
      <td class="col-pct" style="color:${low ? '#854F0B' : '#1F2937'};">${w.pct}%</td>
      <td class="col-comp">${w.oneTap > 0 ? w.oneTap : ''}</td>
      <td class="col-note">${low ? 'v low coverage' : ''}</td>
    </tr>`;
  }).join('');

  return `<table class="completion-table">
    <thead><tr><th class="col-week">Week</th><th class="col-sched">Scheduled</th><th class="col-comp">Completed</th><th class="col-pct">%</th><th class="col-comp">One-tap</th><th class="col-note"></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildLowCompletionCalloutHtml(weeks: WeeklyCompletion[]): string {
  const lowWeeks = weeks.filter(w => w.pct < LOW_COMPLETION_THRESHOLD && w.scheduled > 0);
  if (lowWeeks.length === 0) return '';
  const text = lowWeeks.length === 1
    ? `Week of ${fmtWeekStart(lowWeeks[0].weekStart)} had unusually low completion (${lowWeeks[0].pct}%). Findings spanning this week should be interpreted with lower confidence.`
    : `${lowWeeks.length} weeks had completion below ${LOW_COMPLETION_THRESHOLD}%: ${lowWeeks.map(w => fmtWeekStart(w.weekStart)).join('; ')}. Findings spanning these periods may be less reliable.`;
  return `<div class="callout-box"><p class="callout-text">${esc(text)}</p></div>`;
}

interface DataQualityData {
  weeklyCompletion: WeeklyCompletion[];
  completedCheckIns: number;
  totalScheduled: number;
  oneTap: OneTapSummary;
  missed: MissedByTimeOfDay;
}

/**
 * How much of the record was entered with comfort mode's one-tap answer.
 *
 * Stated because it changes what the scores mean. A one-tap entry sets every
 * slider to that domain's own baseline and records "typical for me" — a real
 * answer, and the app counts it as one, but not a considered one. It is used
 * most on the worst days, so a stretch logged this way can render as the
 * flattest part of the period when it was the hardest.
 */
function buildOneTapHtml(oneTap: OneTapSummary): string {
  if (oneTap.oneTap === 0) return '';
  const pct = Math.round(oneTap.share * 100);
  return `<div class="section-gap">
    <p class="section-label">One-tap entries</p>
    <p class="meth-text">${oneTap.oneTap} of ${oneTap.completed} completed check-ins (${pct}%) were logged with comfort mode's one-tap answer, which records every domain at that person's own baseline rather than a considered rating. They count toward coverage and cap the confidence of any pattern detected across them. A flat stretch containing many of these should be read as "not rated in detail", not as "nothing happening".</p>
  </div>`;
}

/**
 * Where in the day the unanswered check-ins fall — a finding, not a footnote,
 * when they all fall in the same place.
 */
function buildMissedHtml(missed: MissedByTimeOfDay): string {
  if (missed.missed === 0 || missed.scheduled === 0) return '';

  const blocks = (Object.keys(TIME_BLOCK_LABELS) as (keyof typeof TIME_BLOCK_LABELS)[])
    .filter(b => missed.byBlock[b].scheduled > 0)
    .map(b => {
      const { missed: m, scheduled: sch } = missed.byBlock[b];
      return `<tr>
        <td>${esc(TIME_BLOCK_LABELS[b])}</td>
        <td class="center">${sch}</td>
        <td class="center">${m}</td>
        <td class="center">${Math.round((m / sch) * 100)}%</td>
      </tr>`;
    }).join('');

  const standout = missed.standout
    ? `<p class="meth-text"><strong>${missed.standout.missed} of the missed check-ins fall in the ${TIME_BLOCK_LABELS[missed.standout.block].toLowerCase()}</strong> (${Math.round(missed.standout.missRate * 100)}% of that block's slots, against a lower rate across the rest of the day). Consistently missing one part of the day may be a finding in itself rather than a gap in the data.</p>`
    : '';

  return `<div class="section-gap">
    <p class="section-label">When the missed check-ins fall</p>
    <table class="domain-table">
      <thead><tr><th>Time of day</th><th class="center">Scheduled</th><th class="center">Missed</th><th class="center">Miss rate</th></tr></thead>
      <tbody>${blocks}</tbody>
    </table>
    ${standout}
  </div>`;
}

// Ported from the web app's Page5DataQuality.tsx (named for its fixed
// position on the web, always the report's last page regardless of how
// many pages precede it). Named by role here instead of position — this
// file was originally page3-html.ts, on the assumption this page would
// always be third; report chunk 4 then needed to insert Context &
// Connections before it, which would have made that name stale. Renamed
// once, rather than leaving a wrong number in the filename or renaming
// again on the next reorder — page1-html.ts/page2-html.ts keep their
// numeric names since Executive Summary and Mind Overview are always the
// report's first two pages, position-stable in a way this one isn't.
// Closes the loop on Page 1's "Methodology on page N" footer line, which
// chunk 1 dropped since no methodology page existed yet — generate-report.ts
// passes the real page number back into Page 1 for this.
export function buildDataQualityHtml(data: DataQualityData): string {
  const { weeklyCompletion, completedCheckIns, totalScheduled, oneTap, missed } = data;
  const overallPct = totalScheduled > 0 ? Math.round((completedCheckIns / totalScheduled) * 100) : 0;

  return `
    <div class="section-gap">
      <p class="section-label">Mind check-in completion - ${completedCheckIns} of ${totalScheduled} (${overallPct}%)</p>
      ${buildCompletionTableHtml(weeklyCompletion)}
    </div>

    ${buildLowCompletionCalloutHtml(weeklyCompletion)}

    ${buildOneTapHtml(oneTap)}

    ${buildMissedHtml(missed)}

  `;
}

/**
 * The methodology boilerplate, as its own page.
 *
 * It used to sit under the completion table, and the measured layout check
 * put that combined page at 104% of a sheet — it was silently printing onto
 * an unnumbered second one. These three paragraphs are read once, if ever,
 * while the coverage figures above them are read at every appointment, so
 * the prose is what moves rather than the data being capped.
 */
export function buildMethodologyHtml(dateFrom: string, dateTo: string): string {
  return `
    <div class="section-gap">
      <p class="section-label">Methodology</p>
      <p class="meth-text">All data in this report is self-reported by the patient via brief, in-the-moment check-ins (ecological momentary assessment) rather than retrospective recall: several times a day for mind domains, once daily for body and sleep. All pattern detection and computation runs entirely on the patient's device: no data is processed on a server, and no machine learning or population-level model is used anywhere in this pipeline.</p>
      <p class="meth-text">Every deviation, baseline and pattern here is a comparison against that patient's own recent history, a personal baseline computed as the rolling median of their last 30 days of data, never against a population norm. Patterns are only surfaced once they clear a minimum data-coverage threshold; an under-logged pattern is withheld entirely rather than shown with lower confidence, so an absence of findings should not be read as an absence of symptoms. Domain correlations are reported only as a qualitative direction and confidence tier; the underlying correlation coefficient and significance value are deliberately withheld, so a threshold-gated pattern in one person's self-reported history isn't read with more authority than it warrants.</p>
      <p class="meth-text">This report is a structured symptom diary, not a diagnostic tool or a clinical measurement, and correlation shown here never implies causation. Findings are limited to the stated reporting window (${esc(dateFrom)} to ${esc(dateTo)}). For the full methodology, including exact statistical thresholds, data-quality gating rules and the evidence base behind these design decisions, visit symetric.app/for-clinicians.</p>
    </div>
  `;
}
