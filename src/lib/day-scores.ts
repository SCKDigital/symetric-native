import { DOMAIN_ORDER } from '@/lib/domains';
import { CheckIn, DomainType, SleepLog } from '@/lib/supabase';

export interface DayScores {
  date: string;
  scores: Partial<Record<DomainType | 'sleep', number>>;
}

/**
 * Scoped extract of the inline `buildDays` helper from the web app's
 * InsightsScreen.tsx (it isn't its own exported module there — duplicated
 * inline for range-scoped and 90d-scoped calls). Pulled out here since two
 * detectors (day-of-week, lag relationships) both need the same shape.
 */
export function buildDayScores(checkIns: CheckIn[] | null, sleepLogs: SleepLog[] | null): DayScores[] {
  const dayMap = new Map<string, Partial<Record<DomainType | 'sleep', number[]>>>();

  checkIns?.forEach(ci => {
    const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    if (!dayMap.has(date)) dayMap.set(date, {});
    const entry = dayMap.get(date)!;
    DOMAIN_ORDER.forEach(d => {
      const val = ci[d as keyof CheckIn];
      if (val !== null && val !== undefined) {
        if (!entry[d]) entry[d] = [];
        entry[d]!.push(val as number);
      }
    });
  });

  sleepLogs?.forEach(sl => {
    if (sl.score !== null && !sl.skipped) {
      if (!dayMap.has(sl.log_date)) dayMap.set(sl.log_date, {});
      const entry = dayMap.get(sl.log_date)!;
      if (!entry['sleep']) entry['sleep'] = [];
      entry['sleep']!.push(sl.score);
    }
  });

  const days: DayScores[] = [];
  dayMap.forEach((domainArrays, date) => {
    const scores: Partial<Record<DomainType | 'sleep', number>> = {};
    (Object.entries(domainArrays) as [DomainType | 'sleep', number[]][]).forEach(([d, vals]) => {
      scores[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    days.push({ date, scores });
  });

  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

/**
 * Merges two day-scores arrays by date, unioning their per-day scores —
 * used to combine mind and body day-scores for detectors whose math is
 * per-domain/per-pair independent (safe to merge without changing mind-only
 * results) and where cross-area pairs are exactly the point: day-of-week
 * patterns, lag relationships, and intervention (medication) impact.
 * Extracted here once insights.tsx and generate-report.ts both needed the
 * identical merge — ported from the web app's InsightsScreen.tsx's inline
 * mergeDays, unchanged logic.
 */
export function mergeDays<A extends string, B extends string>(
  mindDays: { date: string; scores: Partial<Record<A, number>> }[],
  bodyDays: { date: string; scores: Partial<Record<B, number>> }[],
): { date: string; scores: Partial<Record<A | B, number>> }[] {
  const byDate = new Map<string, Partial<Record<A | B, number>>>();
  for (const d of mindDays) byDate.set(d.date, { ...d.scores } as Partial<Record<A | B, number>>);
  for (const d of bodyDays) {
    const existing = byDate.get(d.date) ?? {};
    byDate.set(d.date, { ...existing, ...d.scores } as Partial<Record<A | B, number>>);
  }
  return [...byDate.entries()].map(([date, scores]) => ({ date, scores })).sort((a, b) => a.date.localeCompare(b.date));
}
