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

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

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
