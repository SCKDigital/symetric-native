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
