// Symptom character: the words, next to the numbers.
//
// The evening check-in asks what pain felt like (aching, burning, electric or
// shooting, and the rest of PAIN_CHARACTER_TAGS) whenever either pain domain
// is above zero, and the same for breathlessness. Those answers have been
// stored on body_checkins as pain_character / breathlessness_character since
// the columns were added, and no part of the report has ever read them.
//
// A severity chart alone cannot distinguish a 6 that is a dull ache from a 6
// that is electric and shooting — which is the distinction a clinician needs
// to separate, say, a mechanical problem from a neuropathic one. The scores
// say how bad; only these say what kind.

const MAX_ENTRIES = 10;

export interface CharacterEntry {
  date: string;
  /** "Pain" or "Breathlessness" — what the tags describe. */
  symptom: string;
  /** The day's scores for that symptom, already formatted. */
  scores: string;
  tags: string[];
}

function fmt(v: unknown): string | null {
  return typeof v === 'number' ? String(Math.round(v * 10) / 10) : null;
}

/**
 * Pulls dated character tags out of the report's own body check-in rows.
 * Newest first, since a clinician reads backwards from the appointment.
 */
export function buildCharacterEntries(rows: Record<string, unknown>[]): CharacterEntry[] {
  const entries: CharacterEntry[] = [];

  for (const row of rows) {
    const date = row.entry_date as string;
    if (!date) continue;

    const painTags = (row.pain_character as string[] | null) ?? [];
    if (painTags.length > 0) {
      // Both pain domains are reported together because the question is asked
      // once, of pain as a whole — see body-check-in.tsx's painCharacterAnchor.
      const parts: string[] = [];
      const mechanical = fmt(row.pain_mechanical);
      const widespread = fmt(row.pain_widespread);
      if (mechanical !== null) parts.push(`${mechanical} joint & muscle`);
      if (widespread !== null) parts.push(`${widespread} widespread`);
      entries.push({ date, symptom: 'Pain', scores: parts.join(', ') || '-', tags: painTags });
    }

    const breathTags = (row.breathlessness_character as string[] | null) ?? [];
    if (breathTags.length > 0) {
      const breath = fmt(row.breathlessness);
      entries.push({
        date,
        symptom: 'Breathing',
        scores: breath !== null ? breath : '-',
        tags: breathTags,
      });
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Renders the block that sits under the body charts. '' when nothing was
 *  described, which is the normal case for someone who logs scores only. */
export function buildCharacterSectionHtml(entries: CharacterEntry[]): string {
  if (entries.length === 0) return '';

  const shown = entries.slice(0, MAX_ENTRIES);
  const hidden = entries.length - shown.length;

  const rows = shown.map(e => `<div class="character-row">
    <span class="character-date">${esc(fmtDay(e.date))}</span>
    <span class="character-symptom">${esc(e.symptom)} ${esc(e.scores)}</span>
    <span class="character-tags">${e.tags.map(esc).join(' &middot; ')}</span>
  </div>`).join('');

  return `<div class="section-gap">
    <p class="section-label">How it felt, in the patient's own terms</p>
    ${rows}
    ${hidden > 0 ? `<p class="overflow-note">${hidden} earlier description${hidden !== 1 ? 's' : ''} not shown.</p>` : ''}
    <p class="sleep-chart-caption">Chosen from a fixed list at the time of logging, alongside the scores charted above. Descriptive only - never scored, ranked or fed into pattern detection.</p>
  </div>`;
}
