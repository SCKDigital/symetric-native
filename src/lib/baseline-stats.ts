// Ported from the web app's src/lib/baseline/stats.ts, plus `mean`.

/** Arithmetic mean. NaN for an empty array, deliberately: the detectors that
 *  use it check their minimum sample sizes first, and a NaN that slips past
 *  shows up instead of passing as a plausible 0. */
export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Population standard deviation (σ, not sample σ). */
export function stddevPop(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
