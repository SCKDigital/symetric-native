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
// Same inline-<svg>-into-HTML approach as sparkline-svg.ts — see its header
// for why nothing is rasterised here.
//
// No reference line of any kind. A population "recommended" 7-9 hour band was
// never an option: it would be the only normative claim in a document whose
// own explainer says a typical score is not the same as a fine one. A median
// line was drawn instead, and that is gone too — a median is the summary this
// chart exists to replace, and drawing it over the nights invites reading the
// bars as deviations from a target rather than as the nights they are. The
// median still sets the top of the axis so a run of long nights cannot be
// clipped; it is simply not shown.

// Matched to the domain sparklines rather than to CONTENT_WIDTH. Both are
// emitted as a bare `width="590"` on the <svg>, which a print stylesheet reads
// as CSS pixels (590px = 442pt), not as the points CONTENT_WIDTH is measured
// in — so a chart declared at CONTENT_WIDTH would come out narrower than the
// sparklines below it and the two date axes would not line up.
const W = SPARKLINE_WIDTH;
const H = 104;
const PAD_L = 22;
const PAD_R = 4; // was 34, to clear the median label that is no longer drawn
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
