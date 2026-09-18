// Direct port of the web app's src/lib/timeFormat.ts. The user's choice lives
// on profiles.time_format; every clock time shown to them goes through here so
// a 24-hour preference is honoured consistently rather than per-screen.

export type TimeFormat = '12hr' | '24hr';

export function formatTime(dateString: string, format: TimeFormat): string {
  const date = new Date(dateString);
  if (format === '24hr') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * A stored 'HH:MM' or 'HH:MM:SS' window time, as a person reads a clock.
 *
 * Lives here rather than in settings-sheets.tsx, where it started: the Today
 * body card needs it too, and a card on Today should not be importing the
 * Settings sheets (and the date picker behind them) to print a time. Note the
 * seconds: Postgres hands back `time` columns as '16:00:00', and rendering that
 * raw is where "Opens at 16:00:00" came from.
 */
export function formatWindowTime(time: string, fmt: TimeFormat): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (fmt === '24hr') return `${String(h).padStart(2, '0')}:${m}`;
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${period}`;
}
