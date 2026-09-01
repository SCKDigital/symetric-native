import { pearson } from '@/lib/detection/pearson';

// Scoped port of the web app's src/lib/detection/computeConnection.ts —
// just the significance-testing math (_computeRaw and its logGamma/incBeta/
// pValue helpers) that lib/report/chart-coordinates.ts's domain-pairwise
// connections need. The pearson() coefficient itself was already ported
// (see pearson.ts's own header comment); computeConnection/FactorKey/
// DayScore (the on-demand "explore a connection" feature, WP1/WP2 in the
// web app) are NOT ported — nothing on native calls them yet.
//
// COMPLIANCE (carried over from the source): Pearson r and p-value are
// computed internally but never returned to callers — direction and
// confidence are qualitative, safe to surface in UI.

export const CORRELATION_MIN_OVERLAP = 14;
export const CORRELATION_MIN_ABS_R = 0.6;

const MIN_OVERLAP = CORRELATION_MIN_OVERLAP;
const MIN_ABS_R = CORRELATION_MIN_ABS_R;
const MAX_P = 0.05;
const CLEAR_ABS_R = 0.7;
const CLEAR_MAX_P = 0.01;

function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - incBeta(1 - x, b, a);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logGamma(a) - logGamma(b) + logGamma(a + b)) / a;
  let f = 1, C = 1, D = 1 - ((a + b) * x) / (a + 1);
  D = D === 0 ? 1e-30 : 1 / D;
  f = D;
  for (let m = 1; m <= 100; m++) {
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    D = 1 + num * D; if (Math.abs(D) < 1e-30) D = 1e-30; D = 1 / D;
    C = 1 + num / C; if (Math.abs(C) < 1e-30) C = 1e-30;
    f *= C * D;
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    D = 1 + num * D; if (Math.abs(D) < 1e-30) D = 1e-30; D = 1 / D;
    C = 1 + num / C; if (Math.abs(C) < 1e-30) C = 1e-30;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return front * f;
}

function pValue(r: number, n: number): number {
  if (n < 4) return 1;
  const df = n - 2;
  const t2 = (r * r * df) / (1 - r * r);
  const x = df / (df + t2);
  return incBeta(x, df / 2, 0.5);
}

export interface RawConnectionResult {
  sufficient: boolean;
  direction: 'together' | 'inverse' | 'none';
  confidence: 'clear' | 'tentative';
  /** Never surface to UI — internal only. */
  _r: number;
}

/** Core Pearson + threshold computation on pre-extracted score arrays. */
export function computeRawConnection(xs: number[], ys: number[]): RawConnectionResult {
  if (xs.length < MIN_OVERLAP) {
    return { sufficient: false, direction: 'none', confidence: 'tentative', _r: 0 };
  }
  const r = pearson(xs, ys);
  const p = pValue(r, xs.length);
  if (Math.abs(r) < MIN_ABS_R || p > MAX_P) {
    return { sufficient: true, direction: 'none', confidence: 'tentative', _r: r };
  }
  const direction = r > 0 ? 'together' : 'inverse';
  const confidence = Math.abs(r) >= CLEAR_ABS_R && p <= CLEAR_MAX_P ? 'clear' : 'tentative';
  return { sufficient: true, direction, confidence, _r: r };
}
