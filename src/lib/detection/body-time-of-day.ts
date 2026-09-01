// Ported from the web app's src/lib/detection/bodyTimeOfDay.ts, unchanged.
//
// Body check-ins are once-daily, so there's no circadian-block equivalent to
// mind's intraday-averaged 4-block detection. But three domains (fatigue,
// pain, orthostatic) get both a morning and an evening reading on days the
// optional morning check-in is used — this detects a consistent same-day
// morning→evening shift for those, the body-domain analog of a day-of-week
// pattern but comparing two fixed positions in the day instead of seven days
// of the week.

import type { BodyDomainType } from '@/lib/supabase';

export interface BodyTimeOfDayPattern {
  domain: BodyDomainType;
  direction: 'worse_in_evening' | 'worse_in_morning';
  difference: number;       // mean |evening - morning|, points
  dayCount: number;         // days with both a morning and evening reading
  consistentDays: number;   // of those, how many showed the same direction
  dataQuality: 'solid' | 'partial' | 'limited';
}

export interface MorningEveningPair {
  date: string;
  domain: BodyDomainType;
  morning: number;
  evening: number;
}

const MIN_DAYS = 10;
const MIN_DIFFERENCE = 1.5;
const SOLID_DIFFERENCE = 2.5;
const SOLID_DAYS = 20;

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function quality(diff: number, days: number): 'solid' | 'partial' | 'limited' {
  if (diff >= SOLID_DIFFERENCE && days >= SOLID_DAYS) return 'solid';
  if (diff >= MIN_DIFFERENCE && days >= MIN_DAYS) return 'partial';
  return 'limited';
}

/**
 * @param pairs One row per (date, domain) where both a morning and an
 *   evening reading exist for that domain that day. Caller is responsible
 *   for extracting these from body_checkins rows.
 */
export function detectBodyTimeOfDayPatterns(pairs: MorningEveningPair[]): BodyTimeOfDayPattern[] {
  const byDomain = new Map<BodyDomainType, MorningEveningPair[]>();
  for (const p of pairs) {
    if (!byDomain.has(p.domain)) byDomain.set(p.domain, []);
    byDomain.get(p.domain)!.push(p);
  }

  const results: BodyTimeOfDayPattern[] = [];

  for (const [domain, rows] of byDomain.entries()) {
    if (rows.length < MIN_DAYS) continue;

    const deltas = rows.map(r => r.evening - r.morning);
    const meanDelta = mean(deltas);
    const absDiff = Math.abs(meanDelta);
    if (absDiff < MIN_DIFFERENCE) continue;

    const direction: 'worse_in_evening' | 'worse_in_morning' = meanDelta > 0 ? 'worse_in_evening' : 'worse_in_morning';
    const consistentDays = deltas.filter(d => (direction === 'worse_in_evening' ? d > 0 : d < 0)).length;

    results.push({
      domain,
      direction,
      difference: absDiff,
      dayCount: rows.length,
      consistentDays,
      dataQuality: quality(absDiff, rows.length),
    });
  }

  return results.sort((a, b) => b.difference - a.difference);
}
