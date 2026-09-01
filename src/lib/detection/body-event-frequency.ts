// Ported from the web app's src/lib/detection/bodyEventFrequency.ts, unchanged.
//
// Body events (subluxation, presyncope, crash_onset, migraine_onset,
// reaction, injury) are discrete adverse incidents, not scores — every
// logged row is already notable by definition. So the useful question isn't
// "is this rare" (rare-events.ts's framing, for symptom-score day-shapes)
// but "is this happening more than it usually does for this user" — a
// personal rate comparison, recent window vs. historical baseline rate.

import type { BodyEventType } from '@/lib/supabase';

export interface BodyEventFrequencyPattern {
  eventType: BodyEventType;
  recentCount: number;
  recentWindowDays: number;
  historicalWindowDays: number;
  recentRatePerWeek: number;
  historicalRatePerWeek: number;
  dataQuality: 'solid' | 'partial';
}

export interface BodyEventInput {
  event_date: string; // YYYY-MM-DD
  event_type: BodyEventType;
}

const RECENT_WINDOW_DAYS = 14;
const MIN_HISTORICAL_DAYS = 30;
const SOLID_HISTORICAL_DAYS = 60;
const MIN_RECENT_COUNT = 2;
const MIN_RATE_MULTIPLE = 2.0;
const SOLID_RECENT_COUNT = 3;

/**
 * @param events All of a user's body events within the full lookback window
 *   (historical + recent), unsorted is fine.
 * @param today YYYY-MM-DD, the end of the recent window.
 */
export function detectBodyEventFrequency(events: BodyEventInput[], today: string): BodyEventFrequencyPattern[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date));
  const earliest = sorted[0].event_date;
  const totalSpanDays = Math.round(
    (new Date(today + 'T12:00:00Z').getTime() - new Date(earliest + 'T12:00:00Z').getTime()) / 86_400_000,
  ) + 1;

  const historicalWindowDays = totalSpanDays - RECENT_WINDOW_DAYS;
  if (historicalWindowDays < MIN_HISTORICAL_DAYS) return [];

  const recentStart = new Date(today + 'T12:00:00Z');
  recentStart.setUTCDate(recentStart.getUTCDate() - (RECENT_WINDOW_DAYS - 1));
  const recentStartStr = recentStart.toLocaleDateString('en-CA');

  const byType = new Map<BodyEventType, { recent: number; historical: number }>();
  for (const e of sorted) {
    if (!byType.has(e.event_type)) byType.set(e.event_type, { recent: 0, historical: 0 });
    const bucket = byType.get(e.event_type)!;
    if (e.event_date >= recentStartStr) bucket.recent++;
    else bucket.historical++;
  }

  const results: BodyEventFrequencyPattern[] = [];

  for (const [eventType, { recent, historical }] of byType.entries()) {
    if (recent < MIN_RECENT_COUNT) continue;

    const recentRatePerWeek = (recent / RECENT_WINDOW_DAYS) * 7;
    const historicalRatePerWeek = (historical / historicalWindowDays) * 7;

    // A zero historical rate is a legitimate baseline (this basically never
    // happened before) — any recent occurrence against that is meaningful,
    // so treat it as clearing the multiple check rather than dividing by zero.
    const clearsMultiple = historicalRatePerWeek === 0
      ? true
      : recentRatePerWeek >= historicalRatePerWeek * MIN_RATE_MULTIPLE;
    if (!clearsMultiple) continue;

    results.push({
      eventType,
      recentCount: recent,
      recentWindowDays: RECENT_WINDOW_DAYS,
      historicalWindowDays,
      recentRatePerWeek: Math.round(recentRatePerWeek * 100) / 100,
      historicalRatePerWeek: Math.round(historicalRatePerWeek * 100) / 100,
      dataQuality: (historicalWindowDays >= SOLID_HISTORICAL_DAYS && recent >= SOLID_RECENT_COUNT) ? 'solid' : 'partial',
    });
  }

  return results.sort((a, b) => b.recentCount - a.recentCount);
}
