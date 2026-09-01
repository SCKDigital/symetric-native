// Ported from the web app's src/lib/detection/bodyBaseline.ts, unchanged.
//
// Body domains have no onboarding-seeded entry in the `baselines` table (that
// table is keyed to the 8 mind DomainType values only). Rather than add a
// schema for it, body detectors bootstrap a baseline the same way mind
// domains already do internally in cluster-detection.ts: once there's enough
// history, the rolling median of the last 14 logged values IS the baseline.
// Before that, fall back to the scale midpoint — body domains run 0-10, so 5
// is neutral, same convention as mind's fallback.

import { median } from '@/lib/baseline-stats';

const MIN_HISTORY_FOR_ROLLING = 7;
const ROLLING_WINDOW = 14;
const FALLBACK_BASELINE = 5;

/**
 * Given a domain's score history in chronological order (oldest first),
 * returns the baseline to compare the most recent value against.
 */
export function rollingBodyBaseline(historyChronological: number[]): number {
  if (historyChronological.length < MIN_HISTORY_FOR_ROLLING) return FALLBACK_BASELINE;
  return median(historyChronological.slice(-ROLLING_WINDOW));
}
