// Ported from the web app's src/lib/detection/bodyDailyValue.ts, unchanged.
//
// Folds a body check-in row's evening + optional morning reading for one
// domain into a single daily value — same "two readings of the same 0-10
// symptom, same day" convention as computeBodySummaries (web's src/lib/
// report/bodySummary.ts, not yet ported), just per-day instead of aggregated
// across a whole window.

import type { BodyDomainType } from '@/lib/supabase';

export function dailyBodyValue(entry: Record<string, unknown>, domain: BodyDomainType): number | null {
  const evening = entry[domain];
  const morning = entry[`morning_${domain}`];
  const values = [evening, morning].filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
