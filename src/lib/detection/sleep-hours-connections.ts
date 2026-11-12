import { mean } from '@/lib/baseline-stats';

// What follows a short night, by hours slept.
//
// sleep-connections.ts answers "does this domain differ after a night rated
// well vs badly". That is the 1-5 quality score. Hours slept was recorded
// every morning alongside it and never compared against anything: it was
// charted on the report's Sleep page and nowhere else. The two can disagree —
// ten hours rated 2 is a common night in this population — so a domain can
// track one and not the other, and which one it tracks is worth knowing.
//
// Short and long are the person's own: the bottom and top third of their
// recorded nights, not a population "7 hours". Someone who needs ten hours
// on a good night would otherwise have every night counted as long, and the
// comparison would be between nothing and everything. The cut-offs travel
// with the result so every sentence can say what "short" meant in hours.
//
// Same shape as the quality comparison deliberately: same-date pairing
// (sleep_logs.log_date is the morning after the night, so a check-in on that
// date is the day that followed it), a mean gap between two groups, the day
// counts on both sides. No significance test, and none implied.

export interface SleepHoursDayScore {
  date: string;
  scores: Record<string, number | undefined>;
}

export interface SleepHoursConnection {
  domain: string;
  /** Mean on days after a night at or under shortCutoff hours. */
  shortMean: number;
  /** Mean on days after a night at or over longCutoff hours. */
  longMean: number;
  /** shortMean - longMean. Positive means higher after short nights. */
  difference: number;
  shortDays: number;
  longDays: number;
  shortCutoff: number;
  longCutoff: number;
  /** Nights with a duration recorded, across the whole window. */
  nights: number;
}

/** Matches sleep-connections.ts' MIN_SLEEP_LOGS: three weeks of nights. */
export const MIN_NIGHTS = 21;
const MIN_GROUP_DAYS = 5;
/** Below an hour between the short and long cut-offs the nights are all much
 *  the same length, and "short" and "long" would be labels on noise. */
const MIN_CUTOFF_SPREAD_HOURS = 1;
/** Smaller than the quality detector's 1.5: a third-vs-third split is a
 *  milder contrast than rated-4-or-5 vs rated-1-or-2, so the gaps it finds
 *  are smaller. A point on a 0-10 scale is still one a person would notice. */
const MIN_DIFFERENCE = 1;

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Rounded to the nearest quarter hour, which is the precision the cut-offs
 *  are printed at — a group boundary of 6.333 h would read as false accuracy. */
function roundQuarter(h: number): number {
  return Math.round(h * 4) / 4;
}

/**
 * Compares each domain's scores on days after the person's shorter nights
 * against days after their longer ones.
 *
 * Returns only domains that cleared every floor, largest gap first, and
 * nothing when there are too few nights or too little spread in their length.
 */
export function detectSleepHoursConnections(
  hoursByDate: Map<string, number>,
  dayScores: SleepHoursDayScore[],
  domains: string[],
): SleepHoursConnection[] {
  const nights = [...hoursByDate.values()].filter(h => Number.isFinite(h) && h > 0);
  if (nights.length < MIN_NIGHTS) return [];

  const sorted = [...nights].sort((a, b) => a - b);
  const shortCutoff = roundQuarter(quantile(sorted, 1 / 3));
  const longCutoff = roundQuarter(quantile(sorted, 2 / 3));
  if (longCutoff - shortCutoff < MIN_CUTOFF_SPREAD_HOURS) return [];

  const results: SleepHoursConnection[] = [];

  for (const domain of domains) {
    const short: number[] = [];
    const long: number[] = [];
    for (const day of dayScores) {
      const value = day.scores[domain];
      const hours = hoursByDate.get(day.date);
      if (value == null || hours == null) continue;
      if (hours <= shortCutoff) short.push(value);
      else if (hours >= longCutoff) long.push(value);
    }
    if (short.length < MIN_GROUP_DAYS || long.length < MIN_GROUP_DAYS) continue;

    const shortMean = mean(short);
    const longMean = mean(long);
    const difference = shortMean - longMean;
    if (Math.abs(difference) < MIN_DIFFERENCE) continue;

    results.push({
      domain, shortMean, longMean, difference,
      shortDays: short.length, longDays: long.length,
      shortCutoff, longCutoff, nights: nights.length,
    });
  }

  return results.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

/** Hours-slept keyed by log date, from sleep_logs rows. Skipped nights and
 *  nights with no duration are left out rather than read as zero. */
export function hoursSleptByDate(
  logs: { log_date: string; hours_slept: number | null; skipped?: boolean | null }[] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const log of logs ?? []) {
    if (log.skipped || log.hours_slept == null) continue;
    map.set(log.log_date, Number(log.hours_slept));
  }
  return map;
}

/** "6.5" / "7" — hours as printed in sentences and table headers. */
export function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100);
}
