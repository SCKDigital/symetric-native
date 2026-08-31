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
