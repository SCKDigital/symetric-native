import type { ChartDomain } from '@/lib/report/chart-coordinates';

// Sparkline rendering, scoped-ported from the web app's lib/report/
// chartImages.ts (renderSparklineImage) — same geometry/thresholds, but
// emitting an inline <svg> markup string instead of a canvas-rendered PNG
// data URL. The web app needs a raster image because @react-pdf/renderer's
// <Image> can't take SVG directly; this port's whole report is HTML
// handed to expo-print, which renders inline SVG natively, so there's no
// rasterization step (and no react-native-view-shot dependency) needed at
// all for this shape of chart.

export const SPARKLINE_WIDTH = 590;
export const SPARKLINE_HEIGHT = 90;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 6;
const PAD_B = 6;

export function sparklineMarkerXFraction(dateIndex: number, datesLength: number): number {
  const pw = SPARKLINE_WIDTH - PAD_L - PAD_R;
  const x = PAD_L + (datesLength <= 1 ? pw / 2 : (dateIndex / (datesLength - 1)) * pw);
  return x / SPARKLINE_WIDTH;
}

function endpointDeviationColor(lastValue: number, baseline: number, isLowerBetter: boolean): string {
  const diff = lastValue - baseline;
  if (Math.abs(diff) < 0.5) return '#5F5E5A';
  const isConcerning = isLowerBetter ? diff > 0 : diff < 0;
  return isConcerning ? '#A32D2D' : '#0F6E56';
}

/** Renders one domain's sparkline as an inline <svg> string, or '' when
 *  there's no data at all (caller shows an "Insufficient data" placeholder
 *  instead — same as the web app's imgSrc-undefined fallback). */
export function renderSparklineSvg(cd: ChartDomain, dates: string[], color: string, isLowerBetter: boolean): string {
  const W = SPARKLINE_WIDTH;
  const H = SPARKLINE_HEIGHT;
  const pw = W - PAD_L - PAD_R;
  const ph = H - PAD_T - PAD_B;

  const nonNull = cd.points.map(p => p.value).filter((v): v is number => v != null);
  if (nonNull.length === 0) return '';

  const rawMin = Math.min(...nonNull);
  const rawMax = Math.max(...nonNull);
  const rng = rawMax - rawMin || 1;
  const pad = rng * 0.2;
  const yMin = Math.max(1, rawMin - pad);
  const yMax = Math.min(10, rawMax + pad);

  function xOf(i: number): number {
    return PAD_L + (dates.length <= 1 ? pw / 2 : (i / (dates.length - 1)) * pw);
  }
  function yOf(v: number): number {
    return PAD_T + ph - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * ph;
  }

  const baseTop = yOf(Math.min(cd.baseline + 0.5, yMax));
  const baseBottom = yOf(Math.max(cd.baseline - 0.5, yMin));
  const baseY = yOf(cd.baseline);

  // Domain line, split into separate polylines across null-value gaps —
  // same segment-break behavior as the web canvas version's beginPath() on
  // a null point.
  const segments: string[] = [];
  let current: string[] = [];
  let lastX = PAD_L, lastY = PAD_T, lastVal: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    const v = cd.points[i]?.value;
    if (v == null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      continue;
    }
    lastX = xOf(i);
    lastY = yOf(v);
    lastVal = v;
    current.push(`${lastX.toFixed(1)},${lastY.toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(' '));

  const polylines = segments
    .map(pts => `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />`)
    .join('');

  const dot = lastVal !== null
    ? `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5" fill="${endpointDeviationColor(lastVal, cd.baseline, isLowerBetter)}" stroke="#ffffff" stroke-width="2" />`
    : '';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${PAD_L}" y="${baseTop.toFixed(1)}" width="${pw}" height="${(baseBottom - baseTop).toFixed(1)}" fill="rgba(209,208,200,0.35)" />
    <line x1="${PAD_L}" y1="${baseY.toFixed(1)}" x2="${PAD_L + pw}" y2="${baseY.toFixed(1)}" stroke="#D1D0C8" stroke-width="1.5" stroke-dasharray="4,3" />
    ${polylines}
    ${dot}
  </svg>`;
}
