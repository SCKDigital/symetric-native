// Ported from the web app's src/utils/dateUtils.ts — only the two functions
// the onboarding age gate needs. Anchored at local noon, same as the source,
// to avoid DST/timezone off-by-one errors when a 'YYYY-MM-DD' string round-trips
// through a Date.

export function parseDateString(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

export function calculateAge(dobStr: string): number {
  const dob = parseDateString(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/** 'YYYY-MM-DD' in the local timezone, from a Date object. */
export function dateToString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The instant a local 'YYYY-MM-DD' day starts, as an ISO timestamp for a
 *  timestamptz range filter. Appending 'T00:00:00Z' instead filters by the
 *  UTC day, which cuts the first morning off a range and pulls in the early
 *  hours after it for anyone not on UTC. */
export function localDayStartISO(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toISOString();
}

/** The last instant of a local 'YYYY-MM-DD' day. See localDayStartISO. */
export function localDayEndISO(dateStr: string): string {
  return new Date(dateStr + 'T23:59:59.999').toISOString();
}

/** 'HH:MM' -> today at that local time, for seeding a time picker. */
export function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** A Date's local wall-clock time as 'HH:MM'. */
export function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' in the local timezone — used to seed/clamp date pickers to "today". */
export function todayDateString(): string {
  return dateToString(new Date());
}

/** Postgres `timestamp` (no timezone) columns round-trip without a 'Z' suffix
 *  — treated as local time by `new Date()` unless corrected. Appends 'Z' only
 *  when the string doesn't already carry its own offset. */
export function ensureUTC(isoString: string): Date {
  if (!isoString) return new Date();
  const hasTimezone = isoString.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(isoString);
  return new Date(hasTimezone ? isoString : isoString + 'Z');
}

/** Returns a 'YYYY-MM-DD' string that is `n` days after `dateStr`. Anchored
 *  at local noon, same as parseDateString, to avoid DST off-by-one errors. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateToString(d);
}

export function formatShortDate(dateStr: string): string {
  return parseDateString(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Every 'YYYY-MM-DD' string from `from` to `to` inclusive. Ported from the
 *  web app's src/utils/dateUtils.ts. */
export function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = parseDateString(from);
  const end = parseDateString(to);
  while (cur <= end) {
    dates.push(dateToString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
