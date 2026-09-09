// Direct port of the web app's src/lib/editWindow.ts — the ten minutes after
// completing a check-in (or logging sleep) during which it can still be
// corrected. Measured from when the entry was made, never from when it was
// last edited, so correcting something twice doesn't buy more time.

const EDIT_WINDOW_MINUTES = 10;

// `now` is optional throughout: callers that render on a ticking clock pass
// their own tick value so the derivation is a pure function of state, rather
// than reading Date.now() during render and relying on the tick to have
// happened first.

/** True if the timestamp is still within the ten-minute edit window. */
export function isWithinEditWindow(completedAt: string | Date, now: number = Date.now()): boolean {
  const diffMs = now - new Date(completedAt).getTime();
  return diffMs / (1000 * 60) <= EDIT_WINDOW_MINUTES;
}

/** Whole minutes remaining in the edit window (0 once closed). */
export function getMinutesRemaining(completedAt: string | Date, now: number = Date.now()): number {
  const diffMs = now - new Date(completedAt).getTime();
  const remaining = EDIT_WINDOW_MINUTES - diffMs / (1000 * 60);
  return Math.max(0, Math.ceil(remaining));
}

/** True once past the edit window but still within the hour — the period the
 *  Today screen says "(Editing window closed)" rather than showing nothing. */
export function wasRecentlyCompleted(completedAt: string | Date): boolean {
  const diffMinutes = (Date.now() - new Date(completedAt).getTime()) / (1000 * 60);
  return diffMinutes > EDIT_WINDOW_MINUTES && diffMinutes <= 60;
}
