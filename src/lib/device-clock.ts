import { getCalendars } from 'expo-localization';

import type { TimeFormat } from '@/lib/time-format';

/**
 * The phone's own 12 or 24-hour setting.
 *
 * Setup no longer asks how times should be shown: nearly everyone wants what
 * their phone already does, and it was one more question on a screen that had
 * too many. It stays changeable in Settings.
 *
 * Falls back to 12-hour, the column default, if the platform won't say.
 */
export function deviceTimeFormat(): TimeFormat {
  try {
    const uses24 = getCalendars()[0]?.uses24hourClock;
    if (uses24 === true) return '24hr';
    if (uses24 === false) return '12hr';
  } catch {
    // Unknown platform answer: use the default below.
  }
  return '12hr';
}
