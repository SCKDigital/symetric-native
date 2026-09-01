import type { WeeklyCompletion } from '@/lib/report/weekly-completion';

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
      <td class="col-note">${low ? 'v low coverage' : ''}</td>
    </tr>`;
  }).join('');

  return `<table class="completion-table">
    <thead><tr><th class="col-week">Week</th><th class="col-sched">Scheduled</th><th class="col-comp">Completed</th><th class="col-pct">%</th><th class="col-note"></th></tr></thead>
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
  dateFrom: string;
  dateTo: string;
  weeklyCompletion: WeeklyCompletion[];
  completedCheckIns: number;
  totalScheduled: number;
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
  const { dateFrom, dateTo, weeklyCompletion, completedCheckIns, totalScheduled } = data;
  const overallPct = totalScheduled > 0 ? Math.round((completedCheckIns / totalScheduled) * 100) : 0;

  return `
    <div class="section-gap">
      <p class="section-label">Mind check-in completion - ${completedCheckIns} of ${totalScheduled} (${overallPct}%)</p>
      ${buildCompletionTableHtml(weeklyCompletion)}
    </div>

    ${buildLowCompletionCalloutHtml(weeklyCompletion)}

    <div class="section-gap">
      <p class="section-label">Methodology</p>
      <p class="meth-text">All data in this report is self-reported by the patient via brief, in-the-moment check-ins (ecological momentary assessment) rather than retrospective recall: several times a day for mind domains, once daily for body and sleep. All pattern detection and computation runs entirely on the patient's device: no data is processed on a server, and no machine learning or population-level model is used anywhere in this pipeline.</p>
      <p class="meth-text">Every deviation, baseline and pattern here is a comparison against that patient's own recent history, a personal baseline computed as the rolling median of their last 30 days of data, never against a population norm. Patterns are only surfaced once they clear a minimum data-coverage threshold; an under-logged pattern is withheld entirely rather than shown with lower confidence, so an absence of findings should not be read as an absence of symptoms. Domain correlations are reported only as a qualitative direction and confidence tier; the underlying correlation coefficient and significance value are deliberately withheld, so a threshold-gated pattern in one person's self-reported history isn't read with more authority than it warrants.</p>
      <p class="meth-text">This report is a structured symptom diary, not a diagnostic tool or a clinical measurement, and correlation shown here never implies causation. Findings are limited to the stated reporting window (${esc(dateFrom)} to ${esc(dateTo)}). For the full methodology, including exact statistical thresholds, data-quality gating rules and the evidence base behind these design decisions, visit symetric.app/for-clinicians.</p>
    </div>
  `;
}
