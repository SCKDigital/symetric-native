import { addDays } from '@/lib/date-utils';
import { mean } from '@/lib/baseline-stats';

// Symptoms around cycle day 1.
//
// The app records Day 1 as an intervention marker and draws it on the charts
// as a "C". Nothing has ever compared symptoms against it. For the population
// this app is built for — the dysautonomia-adjacent cluster, where hormonal
// modulation of POTS, MCAS and joint laxity is well described and routinely
// dismissed — that is the correlation most likely to be real, least likely to
// be noticed unaided, and most likely to have been raised and waved away.
//
// Deliberately not a phase engine. The cycle feature was cut back to Day 1
// only because inferring phases from a single logged date means inventing
// data. This does no inferring: it compares the days near a recorded Day 1
// against the days that are not, and says how many of each it had.

export interface DayScore {
  date: string;
  scores: Record<string, number | undefined>;
}

export interface CycleProximityResult {
  domain: string;
  /** Mean across days within the window either side of a recorded Day 1. */
  nearMean: number;
  /** Mean across every other day with a reading. */
  otherMean: number;
  /** nearMean - otherMean. Positive means higher near Day 1. */
  difference: number;
  nearDays: number;
  otherDays: number;
  /** How many distinct Day 1 markers contributed. */
  cycles: number;
}

/** Days either side of Day 1 counted as "near" — a week-long window centred
 *  on the marker, wide enough to catch a premenstrual run without swallowing
 *  a whole short cycle. */
export const CYCLE_WINDOW_DAYS = 3;

/** Below this the comparison is arithmetic, not evidence: two cycles is the
 *  minimum at which "around Day 1" describes a repetition rather than one
 *  bad week that happened to coincide. */
export const MIN_CYCLES = 2;
const MIN_NEAR_DAYS = 6;
const MIN_OTHER_DAYS = 10;
/** Report a domain only when the gap is big enough to matter on a 0-10 scale. */
const MIN_DIFFERENCE = 0.5;

/**
 * Compares each domain's readings near a recorded cycle day 1 against the
 * rest of the period.
 *
 * Returns the domains that cleared every floor, strongest gap first, and
 * nothing at all when there are too few cycles to speak of. The caller is
 * expected to print the day counts alongside: a difference without them is
 * the kind of claim this app exists not to make.
 */
export function detectCycleProximity(
  dayScores: DayScore[],
  domains: string[],
  cycleDayOneDates: string[],
  windowDays: number = CYCLE_WINDOW_DAYS,
): CycleProximityResult[] {
  const cycles = [...new Set(cycleDayOneDates)];
  if (cycles.length < MIN_CYCLES) return [];

  const nearDates = new Set<string>();
  for (const day1 of cycles) {
    for (let offset = -windowDays; offset <= windowDays; offset++) {
      nearDates.add(addDays(day1, offset));
    }
  }

  const results: CycleProximityResult[] = [];

  for (const domain of domains) {
    const near: number[] = [];
    const other: number[] = [];

    for (const day of dayScores) {
      const value = day.scores[domain];
      if (value == null) continue;
      (nearDates.has(day.date) ? near : other).push(value);
    }

    if (near.length < MIN_NEAR_DAYS || other.length < MIN_OTHER_DAYS) continue;

    const nearMean = mean(near);
    const otherMean = mean(other);
    const difference = nearMean - otherMean;
    if (Math.abs(difference) < MIN_DIFFERENCE) continue;

    results.push({
      domain,
      nearMean,
      otherMean,
      difference,
      nearDays: near.length,
      otherDays: other.length,
      cycles: cycles.length,
    });
  }

  return results.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

// ── Completed cycles ────────────────────────────────────────────────────────
//
// Two consecutive logged Day 1s bound a cycle whose length is known, not
// predicted. Everything below works only on those. Counting back from the
// Day 1 that ends a cycle is the one direction that needs no estimate: the
// second half of a cycle varies far less in length than the first, so "the
// week before Day 1" lands on comparable days whatever the cycle's length,
// where "day 14" would only fit a regular 28-day cycle.

/** Shorter than this, the second Day 1 is more likely a correction or a
 *  duplicate than a new cycle. */
const MIN_CYCLE_LENGTH = 15;
/** Longer than this, a Day 1 in between was most likely never logged, and
 *  counting back from the far end would read the wrong week. */
const MAX_CYCLE_LENGTH = 45;

export interface CompletedCycle {
  /** The Day 1 that starts the cycle. */
  start: string;
  /** The next logged Day 1, which ends it (not part of it). */
  nextDayOne: string;
  lengthDays: number;
}

function daysBetween(a: string, b: string): number {
  // Calendar arithmetic through addDays rather than Date subtraction, so a
  // DST change inside the cycle can't make it a day short. Bounded, since
  // the report's range is at most a year.
  let n = 0;
  let d = a;
  while (d < b && n < 400) { d = addDays(d, 1); n++; }
  return n;
}

/** Every gap between consecutive logged Day 1s, oldest first, whatever its
 *  length. This is what the report lists: a 52-day gap may be a missed log
 *  or a genuinely long cycle, and only the clinician can tell which, so it
 *  is shown rather than dropped. Gaps outside MIN_CYCLE_LENGTH to
 *  MAX_CYCLE_LENGTH are marked `usable: false` and left out of the
 *  comparisons. */
export function dayOneIntervals(cycleDayOneDates: string[]): (CompletedCycle & { usable: boolean })[] {
  const starts = [...new Set(cycleDayOneDates)].sort();
  const intervals: (CompletedCycle & { usable: boolean })[] = [];
  for (let i = 0; i + 1 < starts.length; i++) {
    const lengthDays = daysBetween(starts[i], starts[i + 1]);
    intervals.push({
      start: starts[i], nextDayOne: starts[i + 1], lengthDays,
      usable: lengthDays >= MIN_CYCLE_LENGTH && lengthDays <= MAX_CYCLE_LENGTH,
    });
  }
  return intervals;
}

/** The intervals plausible as one whole cycle — the ones the week-before
 *  comparison counts back from. */
export function completedCycles(cycleDayOneDates: string[]): CompletedCycle[] {
  return dayOneIntervals(cycleDayOneDates).filter(c => c.usable);
}

export { MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH };

/** Days counted back from the Day 1 that ends each cycle. A week: the span
 *  premenstrual symptoms are usually described over. */
export const PRE_DAY_ONE_WINDOW_DAYS = 7;

/**
 * Compares each domain's readings in the week before each Day 1 that ends a
 * completed cycle against the rest of those same cycles.
 *
 * Same result shape and the same floors as detectCycleProximity: "near" is
 * the week before, "other" the remaining days of the completed cycles, and
 * `cycles` counts completed cycles. Only completed cycles take part — the
 * current one has no known end to count back from.
 */
export function detectPreDayOneWindow(
  dayScores: DayScore[],
  domains: string[],
  cycleDayOneDates: string[],
  windowDays: number = PRE_DAY_ONE_WINDOW_DAYS,
): CycleProximityResult[] {
  const cycles = completedCycles(cycleDayOneDates);
  if (cycles.length < MIN_CYCLES) return [];

  const preDates = new Set<string>();
  const restDates = new Set<string>();
  for (const c of cycles) {
    const windowStart = addDays(c.nextDayOne, -windowDays);
    for (let d = c.start; d < c.nextDayOne; d = addDays(d, 1)) {
      (d >= windowStart ? preDates : restDates).add(d);
    }
  }

  const results: CycleProximityResult[] = [];
  for (const domain of domains) {
    const pre: number[] = [];
    const rest: number[] = [];
    for (const day of dayScores) {
      const value = day.scores[domain];
      if (value == null) continue;
      if (preDates.has(day.date)) pre.push(value);
      else if (restDates.has(day.date)) rest.push(value);
    }
    if (pre.length < MIN_NEAR_DAYS || rest.length < MIN_OTHER_DAYS) continue;

    const nearMean = mean(pre);
    const otherMean = mean(rest);
    const difference = nearMean - otherMean;
    if (Math.abs(difference) < MIN_DIFFERENCE) continue;

    results.push({
      domain, nearMean, otherMean, difference,
      nearDays: pre.length, otherDays: rest.length, cycles: cycles.length,
    });
  }

  return results.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}
