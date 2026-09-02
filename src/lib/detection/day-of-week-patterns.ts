import { debug } from '@/lib/debug';
import { BodyDomainType, DomainType } from '@/lib/supabase';

// Ported from the web app's src/lib/detection/dayOfWeekPatterns.ts. Widened
// to cover body domains too (mind+body day-score merge pass, insights.tsx
// now calls this with merged mind+body day-scores) — the detection math
// itself is unchanged, already generic over whatever factor keys the
// scores use.
export type TrackedFactor = DomainType | BodyDomainType;

export interface DayOfWeekPattern {
  domain: TrackedFactor;
  type: 'single_day' | 'weekday_weekend';
  dayOfWeek?: number; // 0=Sun … 6=Sat
  dayName?: string;
  standoutAvg?: number;
  comparisonAvg?: number;
  weekdayAvg?: number;
  weekendAvg?: number;
  difference: number; // absolute point difference
  direction: 'elevated' | 'reduced';
  checkInCount: number;
  weekCount: number; // distinct weeks the standout day had data
  consistentWeeks: number; // of those weeks, how many showed the same direction
  dataQuality: 'solid' | 'partial' | 'limited';
}

interface DayScore {
  date: string;
  scores: Partial<Record<TrackedFactor | 'sleep', number>>;
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const MIN_SPAN_DAYS = 28;
const MIN_CHECKINS_PER_DOW = 3;
const MIN_DIFFERENCE = 1.5;
const MIN_WEEKS = 4;
const SOLID_DIFFERENCE = 2.5;
const SOLID_WEEKS = 6;

function isoWeekKey(dateStr: string): string {
  const d = new Date(Date.UTC(parseInt(dateStr.slice(0, 4)), parseInt(dateStr.slice(5, 7)) - 1, parseInt(dateStr.slice(8, 10))));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

function distinctWeeks(dates: string[]): number {
  return new Set(dates.map(isoWeekKey)).size;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function quality(diff: number, weeks: number): 'solid' | 'partial' | 'limited' {
  if (diff >= SOLID_DIFFERENCE && weeks >= SOLID_WEEKS) return 'solid';
  if (diff >= MIN_DIFFERENCE && weeks >= MIN_WEEKS) return 'partial';
  return 'limited';
}

function countConsistentWeeks(targetByWeek: Map<string, number[]>, otherByWeek: Map<string, number[]>, direction: 'elevated' | 'reduced'): number {
  let consistent = 0;
  for (const [wk, targetScores] of targetByWeek) {
    const otherScores = otherByWeek.get(wk);
    if (!otherScores || otherScores.length === 0) continue;
    const tAvg = mean(targetScores);
    const oAvg = mean(otherScores);
    const wkDir = tAvg > oAvg ? 'elevated' : 'reduced';
    if (wkDir === direction) consistent++;
  }
  return consistent;
}

export function detectDayOfWeekPatterns(days: DayScore[], activeDomains: TrackedFactor[]): DayOfWeekPattern[] {
  if (days.length < MIN_SPAN_DAYS) return [];

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = Math.round((new Date(sorted[sorted.length - 1].date + 'T12:00:00Z').getTime() - new Date(sorted[0].date + 'T12:00:00Z').getTime()) / 86_400_000);
  if (spanDays < MIN_SPAN_DAYS) return [];

  const results: DayOfWeekPattern[] = [];

  for (const domain of activeDomains) {
    const byDow: { scores: number[]; dates: string[] }[] = Array.from({ length: 7 }, () => ({ scores: [], dates: [] }));

    for (const day of sorted) {
      const score = day.scores[domain];
      if (score === undefined) continue;
      const dow = new Date(day.date + 'T12:00:00Z').getUTCDay();
      byDow[dow].scores.push(score);
      byDow[dow].dates.push(day.date);
    }

    const domainDates = sorted.filter(d => d.scores[domain] !== undefined).map(d => d.date);
    if (domainDates.length < 12) continue;

    const domSpan = Math.round((new Date(domainDates[domainDates.length - 1] + 'T12:00:00Z').getTime() - new Date(domainDates[0] + 'T12:00:00Z').getTime()) / 86_400_000);
    if (domSpan < MIN_SPAN_DAYS) continue;

    // ── Weekday vs weekend ────────────────────────────────────────────────────
    const weekendScores = [...byDow[0].scores, ...byDow[6].scores];
    const weekdayScores = [1, 2, 3, 4, 5].flatMap(d => byDow[d].scores);

    if (weekdayScores.length >= 8 && weekendScores.length >= 4) {
      const wdAvg = mean(weekdayScores);
      const weAvg = mean(weekendScores);
      const diff = Math.abs(weAvg - wdAvg);
      const dir: 'elevated' | 'reduced' = weAvg > wdAvg ? 'elevated' : 'reduced';

      if (diff >= MIN_DIFFERENCE) {
        const weekendDates = [...byDow[0].dates, ...byDow[6].dates];
        const weeks = distinctWeeks(weekendDates);
        if (weeks >= MIN_WEEKS) {
          const weByWeek = new Map<string, number[]>();
          const wdByWeek = new Map<string, number[]>();
          for (const [i, score] of byDow[0].scores.entries()) {
            const wk = isoWeekKey(byDow[0].dates[i]);
            if (!weByWeek.has(wk)) weByWeek.set(wk, []);
            weByWeek.get(wk)!.push(score);
          }
          for (const [i, score] of byDow[6].scores.entries()) {
            const wk = isoWeekKey(byDow[6].dates[i]);
            if (!weByWeek.has(wk)) weByWeek.set(wk, []);
            weByWeek.get(wk)!.push(score);
          }
          for (let wd = 1; wd <= 5; wd++) {
            for (const [i, score] of byDow[wd].scores.entries()) {
              const wk = isoWeekKey(byDow[wd].dates[i]);
              if (!wdByWeek.has(wk)) wdByWeek.set(wk, []);
              wdByWeek.get(wk)!.push(score);
            }
          }
          const consistentWeeks = countConsistentWeeks(weByWeek, wdByWeek, dir);

          results.push({
            domain,
            type: 'weekday_weekend',
            weekdayAvg: wdAvg,
            weekendAvg: weAvg,
            difference: diff,
            direction: dir,
            checkInCount: weekendScores.length,
            weekCount: weeks,
            consistentWeeks,
            dataQuality: quality(diff, weeks),
          });
        }
      }
    }

    // ── Individual standout day ───────────────────────────────────────────────
    for (let dow = 0; dow <= 6; dow++) {
      const target = byDow[dow];
      if (target.scores.length < MIN_CHECKINS_PER_DOW) continue;

      const otherScores = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== dow).flatMap(d => byDow[d].scores);
      if (otherScores.length < 10) continue;

      const tAvg = mean(target.scores);
      const oAvg = mean(otherScores);
      const diff = Math.abs(tAvg - oAvg);
      if (diff < MIN_DIFFERENCE) continue;

      const weeks = distinctWeeks(target.dates);
      if (weeks < MIN_WEEKS) continue;

      const isWeekendDay = dow === 0 || dow === 6;
      if (isWeekendDay && results.some(r => r.domain === domain && r.type === 'weekday_weekend')) {
        continue;
      }

      const dir: 'elevated' | 'reduced' = tAvg > oAvg ? 'elevated' : 'reduced';

      const targetByWeek = new Map<string, number[]>();
      for (let i = 0; i < target.dates.length; i++) {
        const wk = isoWeekKey(target.dates[i]);
        if (!targetByWeek.has(wk)) targetByWeek.set(wk, []);
        targetByWeek.get(wk)!.push(target.scores[i]);
      }
      const otherByWeek = new Map<string, number[]>();
      for (let od = 0; od <= 6; od++) {
        if (od === dow) continue;
        for (let i = 0; i < byDow[od].dates.length; i++) {
          const score = byDow[od].scores[i];
          if (score === undefined) continue;
          const wk = isoWeekKey(byDow[od].dates[i]);
          if (!otherByWeek.has(wk)) otherByWeek.set(wk, []);
          otherByWeek.get(wk)!.push(score);
        }
      }
      const consistentWeeks = countConsistentWeeks(targetByWeek, otherByWeek, dir);

      results.push({
        domain,
        type: 'single_day',
        dayOfWeek: dow,
        dayName: DOW_NAMES[dow],
        standoutAvg: tAvg,
        comparisonAvg: oAvg,
        difference: diff,
        direction: dir,
        checkInCount: target.scores.length,
        weekCount: weeks,
        consistentWeeks,
        dataQuality: quality(diff, weeks),
      });
    }
  }

  debug.log('DayOfWeek', `Detected ${results.length} patterns`);
  return results.sort((a, b) => b.difference - a.difference);
}
