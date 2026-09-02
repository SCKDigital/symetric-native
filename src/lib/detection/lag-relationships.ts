import { median as medianOf } from '@/lib/baseline-stats';
import { addDays } from '@/lib/date-utils';
import { debug } from '@/lib/debug';
import { BodyDomainType, DomainType } from '@/lib/supabase';

import { pearson as pearsonR } from './pearson';

// Ported from the web app's src/lib/detection/lagRelationships.ts. Widened
// to cover body domains too, same reasoning as day-of-week-patterns.ts.
export type TrackedFactor = DomainType | BodyDomainType;

export interface LagRelationship {
  predictor: TrackedFactor | 'sleep';
  outcome: TrackedFactor;
  lagDays: 1 | 2;
  direction: 'positive' | 'negative'; // positive = high predictor → high outcome
  instanceCount: number;
  totalPairs: number;
  instanceRate: number;
  correlation: number; // Pearson r — internal only, never shown to user
}

interface DayScore {
  date: string;
  scores: Partial<Record<TrackedFactor | 'sleep', number>>;
}

const MIN_PAIRS = 21;
const MIN_ABS_R = 0.5;
const MIN_INSTANCE_RATE = 0.6;
const MIN_INSTANCE_COUNT = 8;
const MAX_RESULTS = 5;

export function detectLagRelationships(days: DayScore[], activeDomains: TrackedFactor[]): LagRelationship[] {
  if (days.length < MIN_PAIRS + 2) return [];

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const dateMap = new Map<string, DayScore>(sorted.map(d => [d.date, d]));

  // 'sleep' is always a candidate predictor — sleep tracking is standard for
  // all users. Users with no sleep_logs simply produce no sleep-day pairs
  // below (day.scores['sleep'] is undefined), so this degrades to no result
  // rather than an error.
  const predictors: (TrackedFactor | 'sleep')[] = [...activeDomains, 'sleep'];

  const candidates: LagRelationship[] = [];

  for (const predictor of predictors) {
    for (const outcome of activeDomains) {
      if (predictor === outcome) continue;

      for (const lag of [1, 2] as const) {
        const xs: number[] = [];
        const ys: number[] = [];

        for (const day of sorted) {
          const x = day.scores[predictor];
          if (x === undefined) continue;
          const futureDay = dateMap.get(addDays(day.date, lag));
          if (!futureDay) continue;
          const y = futureDay.scores[outcome];
          if (y === undefined) continue;
          xs.push(x);
          ys.push(y);
        }

        if (xs.length < MIN_PAIRS) continue;

        const r = pearsonR(xs, ys);
        if (Math.abs(r) < MIN_ABS_R) continue;

        const direction: 'positive' | 'negative' = r >= 0 ? 'positive' : 'negative';
        const medX = medianOf(xs);
        const medY = medianOf(ys);
        let instances = 0;
        for (let j = 0; j < xs.length; j++) {
          const xHigh = xs[j] > medX;
          const yHigh = ys[j] > medY;
          if (direction === 'positive' ? xHigh === yHigh : xHigh !== yHigh) instances++;
        }

        const instanceRate = instances / xs.length;
        if (instanceRate < MIN_INSTANCE_RATE || instances < MIN_INSTANCE_COUNT) continue;

        candidates.push({ predictor, outcome, lagDays: lag, direction, instanceCount: instances, totalPairs: xs.length, instanceRate, correlation: r });
        debug.log('LagRel', `${predictor}[t] → ${outcome}[t+${lag}]  r=${r.toFixed(2)}  rate=${Math.round(instanceRate * 100)}%`);
      }
    }
  }

  const bestPerPair = new Map<string, LagRelationship>();
  for (const rel of candidates) {
    const key = `${rel.predictor}:${rel.outcome}`;
    const existing = bestPerPair.get(key);
    if (!existing || Math.abs(rel.correlation) > Math.abs(existing.correlation)) {
      bestPerPair.set(key, rel);
    }
  }

  const final = new Map<string, LagRelationship>();
  for (const rel of bestPerPair.values()) {
    const fwd = `${rel.predictor}:${rel.outcome}`;
    const rev = `${rel.outcome}:${rel.predictor}`;
    const existing = final.get(rev);
    if (!existing || Math.abs(rel.correlation) > Math.abs(existing.correlation)) {
      final.delete(rev);
      final.set(fwd, rel);
    }
  }

  return [...final.values()].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, MAX_RESULTS);
}
