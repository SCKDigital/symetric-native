import { toMinutes } from '@/lib/quiet-hours';

/**
 * The rules body check-in times must follow, in words for the person, or null.
 *
 * Shared by body setup and Settings › Body tracking so the two can't disagree.
 * Neither rule was checked before 2026-11-14:
 *
 * - The reminder can't come before the evening check-in opens. Otherwise she
 *   is nudged, opens the app, and there is nothing to log yet.
 * - The morning check-in must open before the evening one. A "morning" reading
 *   taken after the evening one breaks the morning-versus-evening comparison
 *   the morning check-in exists for.
 *
 * All times are 'HH:MM'.
 */
export function bodyTimingProblem(t: {
  eveningFrom: string;
  reminder: string;
  morningEnabled: boolean;
  morningAt: string;
}): string | null {
  if (toMinutes(t.reminder) < toMinutes(t.eveningFrom)) {
    return 'Your reminder needs to be at or after the time the evening check-in opens.';
  }
  if (t.morningEnabled && toMinutes(t.morningAt) >= toMinutes(t.eveningFrom)) {
    return 'The morning check-in needs to open before the evening one.';
  }
  return null;
}
