/**
 * Quiet hours live inside waking hours.
 *
 * Until 2026-11-14 nothing tied the two together: quiet hours could sit
 * overnight, where they did nothing because no check-in is scheduled then, or
 * cover the whole waking window and silently drop every reminder. Both the
 * setup times screen and Settings now go through these helpers.
 *
 * The server (send-notifications isInDndWindow) still accepts any pair,
 * including ones that cross midnight, so rows written before this change keep
 * working exactly as they did.
 *
 * All times are 'HH:MM' strings.
 */

export interface TimeRange {
  start: string;
  end: string;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** A time pulled onto the waking window, for a picker that can't limit itself
 *  (Android's time dialog ignores minimum and maximum). */
export function clampToWindow(time: string, window: TimeRange): string {
  const t = toMinutes(time);
  return fromMinutes(Math.max(toMinutes(window.start), Math.min(toMinutes(window.end), t)));
}

/** Where quiet hours start out when someone adds them: 14:00 to 16:00, the
 *  default Settings always used, if that fits; otherwise two hours from the
 *  middle of the window. */
export function defaultQuietHours(window: TimeRange): TimeRange {
  const ws = toMinutes(window.start);
  const we = toMinutes(window.end);
  if (ws <= 14 * 60 && we >= 16 * 60 && we - ws > 120) return { start: '14:00', end: '16:00' };
  const mid = Math.round((ws + we) / 2 / 15) * 15;
  return { start: fromMinutes(mid - 60), end: fromMinutes(mid + 60) };
}

/**
 * Quiet hours shrunk to fit a (possibly new) waking window, or null when no
 * useful stretch of them is left inside it. Used when waking hours change
 * after quiet hours were set, so the pair can never drift apart again.
 */
export function fitQuietHours(quiet: TimeRange, window: TimeRange): TimeRange | null {
  const ws = toMinutes(window.start);
  const we = toMinutes(window.end);
  let qs = toMinutes(quiet.start);
  let qe = toMinutes(quiet.end);
  // A pair written before this rule existed may cross midnight; there is no
  // sensible in-window reading of it, so start again from the default.
  if (qe <= qs) return defaultQuietHours(window);
  qs = Math.max(ws, Math.min(we, qs));
  qe = Math.max(ws, Math.min(we, qe));
  if (qe - qs < 15) return null;
  // Never the whole window: that silences every reminder.
  if (qs === ws && qe === we) qe = we - 60;
  return { start: fromMinutes(qs), end: fromMinutes(qe) };
}

/** Roughly where the day's check-ins land: the middle of n equal slices of
 *  the window, in minutes. The scheduler picks a random time inside each
 *  slice, so this is only "around". */
export function approxCheckInTimes(window: TimeRange, n: number): number[] {
  const ws = toMinutes(window.start);
  const we = toMinutes(window.end);
  return Array.from({ length: n }, (_, i) => ws + ((we - ws) * (i + 0.5)) / n);
}

/** How many of those rough check-in times fall inside quiet hours. */
export function approxQuietCount(window: TimeRange, n: number, quiet: TimeRange): number {
  const qs = toMinutes(quiet.start);
  const qe = toMinutes(quiet.end);
  return approxCheckInTimes(window, n).filter(m => m >= qs && m < qe).length;
}

/** What's wrong with a quiet-hours pair, in words for the person, or null. */
export function quietHoursProblem(quiet: TimeRange, window: TimeRange): string | null {
  const ws = toMinutes(window.start);
  const we = toMinutes(window.end);
  const qs = toMinutes(quiet.start);
  const qe = toMinutes(quiet.end);
  if (qs < ws || qe > we) return 'Quiet hours need to sit inside your waking hours.';
  if (qe <= qs) return 'Quiet hours need to end after they start.';
  if (qs === ws && qe === we) return "Quiet hours can't cover all of your waking hours, or you'd never be reminded.";
  return null;
}
