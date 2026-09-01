import { CONTENT_WIDTH, theme } from '@/lib/report/theme';
import type { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import type { CircadianPattern } from '@/lib/circadian-detection';

// Scoped port of the web app's lib/report/charts/BarCharts.tsx — same
// geometry/thresholds, emitting inline <svg> markup instead of
// @react-pdf/renderer's Svg/Rect/Line/Text/G primitives (same
// HTML-instead-of-component-tree approach as sparkline-svg.ts; see that
// file's header comment for why no rasterization step is needed here).

const BAR_CHART_W = Math.floor((CONTENT_WIDTH - 12) / 2);
const BAR_CHART_H = 80;
const BAR_PAD_L = 60;
const BAR_PAD_R = 8;
const BAR_PAD_T = 4;
const BAR_PAD_B = 20;
const BAR_PLOT_W = BAR_CHART_W - BAR_PAD_L - BAR_PAD_R;
const BAR_PLOT_H = BAR_CHART_H - BAR_PAD_T - BAR_PAD_B;

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function svgWrap(inner: string): string {
  return `<svg width="${BAR_CHART_W}" height="${BAR_CHART_H}" viewBox="0 0 ${BAR_CHART_W} ${BAR_CHART_H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function axisLines(pl: number, pt: number, ph: number, pw: number): string {
  return `<line x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt + ph}" stroke="${theme.colors.border}" stroke-width="0.5" />
    <line x1="${pl}" y1="${pt + ph}" x2="${pl + pw}" y2="${pt + ph}" stroke="${theme.colors.border}" stroke-width="0.5" />`;
}

function yScaleLabels(pl: number, pt: number, ph: number, maxVal: number): string {
  return `<text x="${pl - 4}" y="${pt + 5}" fill="${theme.colors.muted}" text-anchor="end" font-size="6">${maxVal.toFixed(1)}</text>
    <text x="${pl - 4}" y="${pt + ph}" fill="${theme.colors.muted}" text-anchor="end" font-size="6">0</text>`;
}

export function buildDayOfWeekBarChartSvg(pattern: DayOfWeekPattern): string {
  const pl = BAR_PAD_L, ph = BAR_PLOT_H, pw = BAR_PLOT_W, pt = BAR_PAD_T, pb = BAR_PAD_B;
  const isWW = pattern.type === 'weekday_weekend';

  if (isWW) {
    const labels = ['Weekday', 'Weekend'];
    const values = [pattern.weekdayAvg ?? 0, pattern.weekendAvg ?? 0];
    const maxVal = Math.max(...values, 1);
    const barW = (pw / (labels.length * 2 - 1)) * 0.8;
    const gap = pw / (labels.length * 2 - 1);

    const bars = labels.map((lbl, i) => {
      const x = pl + i * gap * 2;
      const barH = values[i] > 0 ? (values[i] / maxVal) * ph : 1;
      const y = pt + ph - barH;
      const fill = Math.abs(values[i] - values[1 - i]) > 0.3 ? theme.colors.amber : theme.colors.gray;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" fill-opacity="0.7" />
        <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" fill="${theme.colors.heading}" text-anchor="middle" font-size="6">${values[i].toFixed(1)}</text>
        <line x1="${(x + barW / 2).toFixed(1)}" y1="${pt + ph + 1}" x2="${(x + barW / 2).toFixed(1)}" y2="${pt + ph + 2}" stroke="${theme.colors.border}" stroke-width="0.5" />
        <text x="${(x + barW / 2).toFixed(1)}" y="${pt + ph + pb - 6}" fill="${theme.colors.muted}" text-anchor="middle" font-size="6">${lbl}</text>`;
    }).join('');

    return svgWrap(axisLines(pl, pt, ph, pw) + yScaleLabels(pl, pt, ph, maxVal) + bars);
  }

  const standout = pattern.dayOfWeek ?? -1;
  const avgOther = pattern.comparisonAvg ?? 0;
  const avgHigh = pattern.standoutAvg ?? 0;
  const vals = Array(7).fill(avgOther);
  if (standout >= 0) vals[standout] = avgHigh;

  const maxVal = Math.max(...vals, 1);
  const barW = (pw / 7) * 0.65;
  const gap = pw / 7;

  const bars = vals.map((v, i) => {
    const x = pl + i * gap + (gap - barW) / 2;
    const barH = Math.max((v / maxVal) * ph, 1);
    const y = pt + ph - barH;
    const isStandout = i === standout;
    const fill = isStandout ? theme.colors.amber : theme.colors.gray;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" fill-opacity="${isStandout ? 0.8 : 0.35}" />
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" fill="${theme.colors.heading}" font-size="6">${v.toFixed(1)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${pt + ph + pb - 6}" text-anchor="middle" fill="${isStandout ? theme.colors.heading : theme.colors.muted}" font-size="6">${DOW_LABELS[i]}</text>`;
  }).join('');

  return svgWrap(axisLines(pl, pt, ph, pw) + yScaleLabels(pl, pt, ph, maxVal) + bars);
}

export function buildCircadianBarChartSvg(pattern: CircadianPattern): string {
  const blocks: { label: string; avg: number | null; count: number }[] = [
    { label: 'Morn', avg: pattern.morning_avg, count: pattern.morning_count },
    { label: 'Noon', avg: pattern.midday_avg, count: pattern.midday_count },
    { label: 'Aft', avg: pattern.afternoon_avg, count: pattern.afternoon_count },
    { label: 'Eve', avg: pattern.evening_avg, count: pattern.evening_count },
  ];

  const withData = blocks.filter(b => b.avg != null && b.count > 0);
  if (withData.length === 0) return '';

  const maxVal = Math.max(...withData.map(b => b.avg!), 1);
  const pl = BAR_PAD_L, ph = BAR_PLOT_H, pw = BAR_PLOT_W, pt = BAR_PAD_T, pb = BAR_PAD_B;
  const barW = (pw / (blocks.length * 2 - 1)) * 0.85;
  const gap = pw / blocks.length;

  const bars = blocks.map((b, i) => {
    if (b.avg == null || b.count === 0) return '';
    const x = pl + i * gap + (gap - barW) / 2;
    const barH = Math.max((b.avg / maxVal) * ph, 1);
    const y = pt + ph - barH;
    const isHigh = b.label.toLowerCase().startsWith(pattern.highest_block.slice(0, 3).toLowerCase());
    const fill = isHigh ? theme.colors.amber : theme.colors.gray;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" fill-opacity="${isHigh ? 0.8 : 0.35}" />
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" fill="${theme.colors.heading}" font-size="6">${b.avg.toFixed(1)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${pt + ph + pb - 6}" text-anchor="middle" fill="${isHigh ? theme.colors.heading : theme.colors.muted}" font-size="6">${b.label}</text>`;
  }).join('');

  return svgWrap(axisLines(pl, pt, ph, pw) + yScaleLabels(pl, pt, ph, maxVal) + bars);
}
