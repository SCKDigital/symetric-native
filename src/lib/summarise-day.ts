import type { DomainType } from '@/lib/supabase';
import { DOMAIN_NAMES } from '@/lib/domains';

// Ported from the web app's src/lib/history/summariseDay.ts, unchanged —
// pure string/math logic, no DOM/browser dependency.

export interface DaySummaryCheckIn {
  /** ISO timestamp — completed_at (fall back to scheduled_at upstream). */
  time: string;
  values: Partial<Record<DomainType, number>>;
}

/** One body domain's paired same-day am/pm reading — body tracking isn't
 *  ported yet, so callers always pass an empty array for now. */
export interface BodyReadingPair {
  am: number;
  pm: number;
}

export interface SummariseDayInput {
  checkIns: DaySummaryCheckIn[];
  bodyPairs: BodyReadingPair[];
}

const SWING_RANGE = 4;
const LEVEL_RANGE = 1;
const DIRECTION_THRESHOLD = 1.5;
const MAX_DIRECTION_DOMAINS = 2;
const BODY_DIRECTION_THRESHOLD = 1.5;

function timeOfDay(isoTime: string): string {
  const hour = new Date(isoTime).getHours();
  if (hour < 5) return 'overnight';
  if (hour < 12) return 'in the morning';
  if (hour < 14) return 'around midday';
  if (hour < 18) return 'in the afternoon';
  if (hour < 22) return 'in the evening';
  return 'at night';
}

function domainNamesJoined(domains: DomainType[]): string {
  const names = domains.map((d, i) => (i === 0 ? DOMAIN_NAMES[d] : DOMAIN_NAMES[d].toLowerCase()));
  if (names.length === 1) return names[0];
  return names.join(' and ');
}

function largestRange(checkIns: DaySummaryCheckIn[]): number {
  const domains = Object.keys(DOMAIN_NAMES) as DomainType[];
  let max = 0;
  for (const domain of domains) {
    const values = checkIns.map(c => c.values[domain]).filter((v): v is number => v !== undefined && v !== null);
    if (values.length < 2) continue;
    const range = Math.max(...values) - Math.min(...values);
    if (range > max) max = range;
  }
  return max;
}

function variabilityClause(checkIns: DaySummaryCheckIn[]): string {
  const range = largestRange(checkIns);
  if (range >= SWING_RANGE) return 'A swinging day';
  if (range > LEVEL_RANGE) return 'Some movement today';
  return 'A fairly level day';
}

function directionDomains(checkIns: DaySummaryCheckIn[]): { rising: DomainType[]; falling: DomainType[] } {
  const sorted = [...checkIns].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const mid = Math.ceil(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const domains = Object.keys(DOMAIN_NAMES) as DomainType[];
  const shifts: { domain: DomainType; diff: number }[] = [];

  for (const domain of domains) {
    const firstValues = firstHalf.map(c => c.values[domain]).filter((v): v is number => v !== undefined && v !== null);
    const secondValues = secondHalf.map(c => c.values[domain]).filter((v): v is number => v !== undefined && v !== null);
    if (firstValues.length === 0 || secondValues.length === 0) continue;
    const firstMean = firstValues.reduce((a, b) => a + b, 0) / firstValues.length;
    const secondMean = secondValues.reduce((a, b) => a + b, 0) / secondValues.length;
    const diff = secondMean - firstMean;
    if (Math.abs(diff) >= DIRECTION_THRESHOLD) shifts.push({ domain, diff });
  }

  shifts.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const top = shifts.slice(0, MAX_DIRECTION_DOMAINS);

  const rising = top.filter(s => s.diff > 0);
  const falling = top.filter(s => s.diff < 0);
  const winner = rising.length >= falling.length ? rising : falling;
  return winner === rising ? { rising: winner.map(s => s.domain), falling: [] } : { rising: [], falling: winner.map(s => s.domain) };
}

function directionClause(checkIns: DaySummaryCheckIn[]): string | null {
  const sorted = [...checkIns].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const mid = Math.ceil(sorted.length / 2);
  const shiftTime = sorted[mid]?.time ?? sorted[sorted.length - 1].time;

  const { rising, falling } = directionDomains(checkIns);
  if (rising.length > 0) {
    return `${domainNamesJoined(rising)} picked up ${timeOfDay(shiftTime)}`;
  }
  if (falling.length > 0) {
    return `${domainNamesJoined(falling)} dropped away ${timeOfDay(shiftTime)}`;
  }
  return null;
}

function bodyDirectionClause(bodyPairs: BodyReadingPair[]): string | null {
  if (bodyPairs.length === 0) return null;
  const avgDiff = bodyPairs.reduce((sum, p) => sum + (p.pm - p.am), 0) / bodyPairs.length;
  if (avgDiff >= BODY_DIRECTION_THRESHOLD) return 'body symptoms built into the evening';
  if (avgDiff <= -BODY_DIRECTION_THRESHOLD) return 'body symptoms eased through the evening';
  return null;
}

export function summariseDay(input: SummariseDayInput): string {
  const { checkIns, bodyPairs } = input;

  if (checkIns.length === 0) {
    return 'No check-ins.';
  }

  if (checkIns.length === 1) {
    return `One check-in, ${timeOfDay(checkIns[0].time)}. Not enough to describe the day.`;
  }

  const sentence1 = `${variabilityClause(checkIns)}.`;

  const clauses = [directionClause(checkIns), bodyDirectionClause(bodyPairs)].filter((c): c is string => c !== null);

  if (clauses.length === 0) return sentence1;

  const sentence2 = `${clauses[0].charAt(0).toUpperCase()}${clauses[0].slice(1)}${clauses[1] ? `, and ${clauses[1]}` : ''}.`;

  return `${sentence1} ${sentence2}`;
}
