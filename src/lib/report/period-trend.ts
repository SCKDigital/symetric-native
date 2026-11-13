import { median } from '@/lib/baseline-stats';
import { addDays } from '@/lib/date-utils';
import { higherIsWorse } from '@/lib/domain-polarity';
import { theme } from '@/lib/report/theme';

// Which way a domain moved over the reporting window.
//
// The report used to draw its trend arrows from a different number than the
// one its captions were written from. The arrow compared "current" (the
// median of the WHOLE window, so not current at all) against the stored
// all-time baseline; the "improving trend over the reporting window" caption
// compared the window's first 30 days against its last 30. On one printed
// report motivation read "3.7 ↓" beside "improving trend (earlier avg 3.0 ->
// recent avg 4.0)" — both true, of different things, and a clinician cannot
// tell which.
//
// This is now the one definition. The windows are pattern-evolution.ts's own
// (first and last 30 days, anchored on the first and last logged day), and
// shrink to halves on a range too short for two 30-day windows. So whenever
// that detector says a domain improved or worsened, the arrow points the same
// way, worked out from the same scores.

const MAX_WINDOW_DAYS = 30;
/** Fewer readings than this in either window and no trend is claimed. */
const MIN_READINGS = 3;
/** Smaller moves than this draw a flat arrow. */
const FLAT_BELOW = 0.3;

export interface PeriodTrend {
  /** Median of the domain's daily scores in the first window. */
  earlier: number;
  /** Median of the domain's daily scores in the last window. */
  recent: number;
}

export interface DomainTrends {
  /** Length of each window, in days. Shared by every domain. */
  windowDays: number;
  byDomain: Record<string, PeriodTrend>;
}

interface DayScores {
  date: string;
  scores: Partial<Record<string, number>>;
}

export function computeDomainTrends(days: DayScores[], domains: string[]): DomainTrends {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return { windowDays: 0, byDomain: {} };

  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;
  const spanDays = Math.round((new Date(lastDate + 'T12:00:00Z').getTime() - new Date(firstDate + 'T12:00:00Z').getTime()) / 86_400_000) + 1;
  const windowDays = Math.min(MAX_WINDOW_DAYS, Math.floor(spanDays / 2));
  if (windowDays < 1) return { windowDays: 0, byDomain: {} };

  const earlierEnd = addDays(firstDate, windowDays - 1);
  const recentStart = addDays(lastDate, -(windowDays - 1));

  const byDomain: Record<string, PeriodTrend> = {};
  for (const domain of domains) {
    const earlier = sorted.filter(d => d.date <= earlierEnd).map(d => d.scores[domain]).filter((v): v is number => v != null);
    const recent = sorted.filter(d => d.date >= recentStart).map(d => d.scores[domain]).filter((v): v is number => v != null);
    if (earlier.length < MIN_READINGS || recent.length < MIN_READINGS) continue;
    byDomain[domain] = { earlier: median(earlier), recent: median(recent) };
  }
  return { windowDays, byDomain };
}

/** Raw direction of the score: ↑ means the number went up, whatever that
 *  means for this domain. Colour says whether that is better or worse. */
export function periodTrendArrow(trend: PeriodTrend | undefined): string {
  if (!trend) return '–';
  const diff = trend.recent - trend.earlier;
  if (Math.abs(diff) < FLAT_BELOW) return '→';
  return diff > 0 ? '↑' : '↓';
}

/** Teal for a move in the good direction, coral for the bad one, grey when
 *  flat — by the same polarity pattern-evolution.ts words "improving" with. */
export function periodTrendColor(domain: string, trend: PeriodTrend | undefined): string {
  if (!trend) return theme.colors.gray;
  const diff = trend.recent - trend.earlier;
  if (Math.abs(diff) < FLAT_BELOW) return theme.colors.gray;
  const better = higherIsWorse(domain) ? diff < 0 : diff > 0;
  return better ? theme.colors.teal : theme.colors.coral;
}

/** "first 30 days" — the column and chart wording for a window. */
export function windowLabel(position: 'first' | 'last', windowDays: number): string {
  return `${position} ${windowDays} day${windowDays !== 1 ? 's' : ''}`;
}
