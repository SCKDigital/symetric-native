// Ported from the web app's src/lib/detection/clusterShapeDetectors.ts, unchanged.

import { parseDateString } from '@/lib/date-utils';
import { CheckIn, DomainType } from '@/lib/supabase';

// ── Intraday volatility detection ─────────────────────────────────────────────
// Flags days where scores span ≥ 4 points across check-ins for a given domain.

export function detectIntradayVolatility(checkIns: CheckIn[], domain: DomainType): { date: string; swingMagnitude: number }[] {
  const byDate = new Map<string, number[]>();

  checkIns.forEach(ci => {
    const val = ci[domain];
    if (val === null || val === undefined) return;
    const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(val as number);
  });

  const results: { date: string; swingMagnitude: number }[] = [];
  byDate.forEach((scores, date) => {
    if (scores.length < 2) return;
    const swing = Math.max(...scores) - Math.min(...scores);
    if (swing >= 4) results.push({ date, swingMagnitude: swing });
  });

  return results;
}

// ── Weekly oscillation detection ──────────────────────────────────────────────
// Flags 7-day windows where mood alternates ≥ 3 times between
// ≥ 2 points above baseline and ≥ 2 points below baseline.

export function detectWeeklyOscillations(
  dailyMoodAvgs: { date: string; avg: number }[],
  baseline: number,
): { startDate: string; endDate: string; numSwitches: number; meanDeviation: number }[] {
  if (dailyMoodAvgs.length < 4) return [];

  const sorted = [...dailyMoodAvgs].sort((a, b) => a.date.localeCompare(b.date));
  const candidates: { startDate: string; endDate: string; numSwitches: number; meanDeviation: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i].date;
    const windowEndDate = parseDateString(windowStart);
    windowEndDate.setDate(windowEndDate.getDate() + 6);
    const windowEndStr = windowEndDate.toLocaleDateString('en-CA');

    const window = sorted.filter(d => d.date >= windowStart && d.date <= windowEndStr);
    if (window.length < 4) continue;

    let switches = 0;
    let prevDir: 'elevated' | 'depressed' | null = null;
    const deviations: number[] = [];

    window.forEach(({ avg }) => {
      const dev = avg - baseline;
      if (Math.abs(dev) < 2) return;
      deviations.push(Math.abs(dev));
      const dir = dev > 0 ? 'elevated' : 'depressed';
      if (prevDir && dir !== prevDir) switches++;
      prevDir = dir;
    });

    if (switches >= 3) {
      const meanDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      candidates.push({ startDate: windowStart, endDate: window[window.length - 1].date, numSwitches: switches, meanDeviation });
    }
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => (a.startDate !== b.startDate ? a.startDate.localeCompare(b.startDate) : b.numSwitches - a.numSwitches));

  const result: typeof candidates = [];
  let lastEnd: string | null = null;
  for (const c of candidates) {
    if (!lastEnd || c.startDate > lastEnd) {
      result.push(c);
      lastEnd = c.endDate;
    }
  }
  return result;
}
