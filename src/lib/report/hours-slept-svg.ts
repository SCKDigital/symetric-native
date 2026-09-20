import { SPARKLINE_WIDTH } from '@/lib/report/sparkline-svg';
import { theme } from '@/lib/report/theme';

// Hours slept, charted per night. Not a port of anything — neither the web
// report nor this one has ever drawn it. Hours were reduced to a single
// "Median hours slept: 7.2 hours" row, sitting next to a sleep *quality*
// score, which is a different measurement on a different scale: quality is
// the 1-5 rating the check-in asks for, duration is a count of hours, and
// collapsing duration to one number hides the thing a clinician asks about
// first — whether the nights are consistent or all over the place. Two people
// with a 7.2-hour median, one steady and one alternating 4 and 11, produced
// an identical report line.
//
// Same inline-<svg>-into-HTML approach as sparkline-svg.ts (see its header for
// why nothing is rasterised here), and the same reference-line convention as
// the domain sparklines: the line drawn is this person's own median, never a
// population "recommended" band. A normative 7-9 hour stripe would contradict
// the report's own explainer — "not 'fine' in an absolute sense" — and would
// be the only population claim in the document.

// Matched to the domain sparklines rather than to CONTENT_WIDTH. Both are
// emitted as a bare `width="590"` on the <svg>, which a print stylesheet reads
// as CSS pixels (590px = 442pt), not as the points CONTENT_WIDTH is measured
// in — so a chart declared at CONTENT_WIDTH would come out narrower than the
// sparklines below it and the two date axes would not line up.
const W = SPARKLINE_WIDTH;
const H = 104;
const PAD_L = 22;
const PAD_R = 34; // room for the median label at the right-hand end
const PAD_T = 8;
const PAD_B = 16;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

export interface HoursSleptPoint {
  date: string;
  /** Null for a night with no log, or one logged without a duration. */
  hours: number | null;
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Renders the per-night hours chart, or '' when there is nothing to draw —
 * the caller shows its own "not recorded" line in that case.
 *
 * `points` is expected to cover every date in the report range in order, gaps
 * included: an unlogged night must be a gap in the chart rather than a missing
 * column that silently shortens the timeline.
 */
export function renderHoursSleptSvg(points: HoursSleptPoint[], medianHours: number): string {
  const logged = points.filter(p => p.hours != null) as { date: string; hours: number }[];
  if (logged.length === 0 || points.length === 0) return '';

  // Axis top: the next even hour above both the longest night and the median,
  // with a floor of 8 so a run of short nights still reads as short rather
  // than filling the plot.
  const maxHours = Math.max(...logged.map(p => p.hours), medianHours);
  const yMax = Math.max(8, Math.ceil(maxHours / 2) * 2);

  const n = points.length;
  const slot = PLOT_W / n;
  // Thin bars on a 90-day range are legible as a distribution; thick ones on a
  // 7-day range are not comparable to anything, hence the cap.
  const barW = Math.max(1, Math.min(slot * 0.7, 14));

  const yOf = (h: number) => PAD_T + PLOT_H - (Math.max(0, Math.min(yMax, h)) / yMax) * PLOT_H;

  const bars = points.map((p, i) => {
    if (p.hours == null) return '';
    const x = PAD_L + i * slot + (slot - barW) / 2;
    const y = yOf(p.hours);
    const h = Math.max(0.6, PAD_T + PLOT_H - y);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${theme.colors.gray}" fill-opacity="0.55" />`;
  }).join('');

  const midHours = yMax / 2;
  const gridlines = [midHours, yMax].map(h =>
    `<line x1="${PAD_L}" y1="${yOf(h).toFixed(1)}" x2="${(PAD_L + PLOT_W).toFixed(1)}" y2="${yOf(h).toFixed(1)}" stroke="${theme.colors.border}" stroke-width="0.4" />`
  ).join('');

  const yLabels = [0, midHours, yMax].map(h =>
    `<text x="${PAD_L - 3}" y="${(yOf(h) + 2).toFixed(1)}" text-anchor="end" fill="${theme.colors.muted}" font-size="6">${h % 1 === 0 ? h : h.toFixed(1)}</text>`
  ).join('');

  const medianY = yOf(medianHours);
  const medianLine = `<line x1="${PAD_L}" y1="${medianY.toFixed(1)}" x2="${(PAD_L + PLOT_W).toFixed(1)}" y2="${medianY.toFixed(1)}" stroke="${theme.colors.heading}" stroke-width="0.8" stroke-dasharray="4,3" />
    <text x="${(PAD_L + PLOT_W + 3).toFixed(1)}" y="${(medianY + 2).toFixed(1)}" fill="${theme.colors.heading}" font-size="6">med ${medianHours.toFixed(1)}h</text>`;

  // First and last night only. Every column is one night, in order, and the
  // sparklines directly below share this date range, so denser labelling would
  // repeat what that section already establishes.
  const xLabels = `<text x="${PAD_L}" y="${(H - 4).toFixed(1)}" fill="${theme.colors.muted}" font-size="6">${fmtDay(points[0].date)}</text>
    <text x="${(PAD_L + PLOT_W).toFixed(1)}" y="${(H - 4).toFixed(1)}" text-anchor="end" fill="${theme.colors.muted}" font-size="6">${fmtDay(points[n - 1].date)}</text>`;

  const axis = `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + PLOT_H}" stroke="${theme.colors.border}" stroke-width="0.5" />
    <line x1="${PAD_L}" y1="${(PAD_T + PLOT_H).toFixed(1)}" x2="${(PAD_L + PLOT_W).toFixed(1)}" y2="${(PAD_T + PLOT_H).toFixed(1)}" stroke="${theme.colors.border}" stroke-width="0.5" />`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${gridlines}
    ${axis}
    ${bars}
    ${medianLine}
    ${yLabels}
    ${xLabels}
  </svg>`;
}

/** Longest and shortest logged night, and how many nights carried a duration —
 *  the spread the median alone cannot show, stated in words beneath the chart
 *  for anyone reading the report in print or without colour. */
export function summariseHoursSlept(points: HoursSleptPoint[]): {
  nights: number; min: number; max: number;
} | null {
  const logged = points.map(p => p.hours).filter((h): h is number => h != null);
  if (logged.length === 0) return null;
  return { nights: logged.length, min: Math.min(...logged), max: Math.max(...logged) };
}
