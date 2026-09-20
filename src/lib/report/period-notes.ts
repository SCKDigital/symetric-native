// What she wrote at the time.
//
// Every mind check-in offers 200 characters of context ("What's affecting
// these scores?") and every body check-in a note. Until now the report read
// neither — a body note surfaced only when the same day happened to carry a
// logged event, as that event's "context" column, and a mind note never
// surfaced at all.
//
// That is the single largest gap between what this app holds and what it
// hands over. The whole point of logging in the moment is that the moment is
// not available later: at the appointment she is reconstructing from memory
// the very thing she already wrote down. A spike on 25 Aug is a different
// conversation from a spike on 25 Aug annotated "third night up with
// palpitations, missed work".
//
// Notes are never analysed, scored or searched for keywords. They are
// reproduced verbatim, dated, and ordered so the ones attached to something
// the report already flagged come first.

const MAX_NOTES = 10;
const MAX_LENGTH = 220;

export interface PeriodNote {
  date: string;
  source: 'mind' | 'body';
  text: string;
  /** True when this day is one the report already draws attention to — a
   *  flagged episode, a marker, or a rare event. */
  notable: boolean;
}

export interface PeriodNotesInput {
  /** Completed mind check-ins in range; `notes` and `scheduled_at` are read. */
  checkIns: { notes?: string | null; scheduled_at: string; status?: string }[];
  /** Body check-ins in range; `note` and `entry_date` are read. */
  bodyCheckIns: Record<string, unknown>[];
  /** Dates the rest of the report already points at, in any order. */
  notableDates: Iterable<string>;
}

function clean(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > MAX_LENGTH ? `${trimmed.slice(0, MAX_LENGTH - 1)}…` : trimmed;
}

/**
 * Collects the period's written notes, notable days first and newest within
 * each group.
 *
 * Several check-ins a day each carry their own note, and all of them are
 * kept: two entries on one date saying different things is the record, not a
 * duplicate.
 */
export function buildPeriodNotes(input: PeriodNotesInput): { notes: PeriodNote[]; total: number } {
  const notable = new Set(input.notableDates);
  const collected: PeriodNote[] = [];

  for (const ci of input.checkIns) {
    if (ci.status != null && ci.status !== 'completed') continue;
    const text = clean(ci.notes);
    if (!text) continue;
    const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    collected.push({ date, source: 'mind', text, notable: notable.has(date) });
  }

  for (const row of input.bodyCheckIns) {
    const text = clean(row.note);
    const date = row.entry_date as string;
    if (!text || !date) continue;
    collected.push({ date, source: 'body', text, notable: notable.has(date) });
  }

  collected.sort((a, b) => {
    if (a.notable !== b.notable) return a.notable ? -1 : 1;
    return b.date.localeCompare(a.date);
  });

  return { notes: collected.slice(0, MAX_NOTES), total: collected.length };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function buildPeriodNotesHtml(result: { notes: PeriodNote[]; total: number }): string {
  if (result.notes.length === 0) return '';
  const hidden = result.total - result.notes.length;

  const rows = result.notes.map(n => `<div class="note-row">
    <span class="note-date">${esc(fmtDay(n.date))}${n.notable ? ' <strong>&bull;</strong>' : ''}</span>
    <span class="note-text">${esc(n.text)}</span>
  </div>`).join('');

  return `<div class="section-gap">
    <p class="section-label">Written at the time</p>
    ${rows}
    ${hidden > 0 ? `<p class="overflow-note">${hidden} further note${hidden !== 1 ? 's' : ''} not shown.</p>` : ''}
    <p class="sleep-chart-caption">The patient's own words, entered with the check-in and reproduced unedited. A bullet marks a day this report already flags elsewhere. Not analysed or scored.</p>
  </div>`;
}
