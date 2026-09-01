import { median } from '@/lib/baseline-stats';
import { getDatesInRange } from '@/lib/date-utils';
import { computeRawConnection } from '@/lib/detection/compute-connection';
import { DOMAIN_ORDER } from '@/lib/domains';
import type { CheckIn, SleepLog } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

// Scoped port of the web app's lib/report/chartMath.ts — buildChartCoordinates
// and both halves of computeConnections (unchanged math). The domain-pairwise
// half needs detection/compute-connection.ts's significance-testing math,
// ported alongside this in report chunk 4.

const DASH_PATTERNS = ['', '5,3', '2,3', '5,3,2,3'];

export interface ChartDomain {
  domain: string;
  points: { date: string; value: number | null }[];
  baseline: number;
  dashPattern: string;
  observedMin: number;
  observedMax: number;
}

export interface ChartMarker {
  dateIndex: number;
  markerType: string;
  label: string;
}

export interface DomainCoverage {
  domain: string;
  coveredDays: number;
  totalDays: number;
  percentage: number;
}

export interface SleepConnection {
  domain: string;
  observation: string;
}

export interface DomainConnection {
  domainA: string;
  domainB: string;
  direction: 'positive' | 'negative';
  n: number; // overlapping check-in count
}

type DailyMeans = Record<string, Record<string, number | null>>;

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function buildDailyMeans(checkIns: CheckIn[], sleepLogs: SleepLog[], dates: string[]): DailyMeans {
  const result: DailyMeans = {};
  dates.forEach(date => {
    result[date] = {};
    DOMAIN_ORDER.forEach(d => { result[date][d] = null; });
    result[date]['sleep'] = null;
  });

  const byDate: Record<string, CheckIn[]> = {};
  checkIns.forEach(ci => {
    const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(ci);
  });

  dates.forEach(date => {
    const cis = byDate[date] || [];
    DOMAIN_ORDER.forEach(d => {
      const vals = cis.map(ci => ci[d as keyof CheckIn]).filter((v): v is number => v != null);
      result[date][d] = vals.length > 0 ? mean(vals) : null;
    });
  });

  sleepLogs.forEach(sl => {
    if (dates.includes(sl.log_date) && sl.score != null && !sl.skipped) {
      result[sl.log_date]['sleep'] = sl.score;
    }
  });

  return result;
}

export interface ChartCoordinatesResult {
  dates: string[];
  dailyMeans: DailyMeans;
  trackedDomains: string[];
  chartDomains: ChartDomain[];
  domainCoverage: DomainCoverage[];
  chartMarkers: ChartMarker[];
  chartHasEnoughData: boolean;
  currentRollingMedians: Record<string, number>;
}

export function buildChartCoordinates(
  checkIns: CheckIn[],
  sleepLogs: SleepLog[],
  baselineMap: Record<string, number>,
  activeDomains: string[],
  dateRange: { from: string; to: string },
  markers: InterventionMarker[],
): ChartCoordinatesResult {
  const dates = getDatesInRange(dateRange.from, dateRange.to);
  const dailyMeans = buildDailyMeans(checkIns, sleepLogs, dates);

  const allDomains = [...activeDomains, ...DOMAIN_ORDER.filter(d => !activeDomains.includes(d))];

  const trackedDomains = allDomains.filter(d => {
    const vals = dates.map(date => dailyMeans[date]?.[d]).filter((v): v is number => v != null);
    return vals.length >= 5;
  });

  const domainCoverage: DomainCoverage[] = trackedDomains.map(domain => {
    const coveredDays = dates.filter(date => dailyMeans[date]?.[domain] != null).length;
    return { domain, coveredDays, totalDays: dates.length, percentage: dates.length > 0 ? Math.round((coveredDays / dates.length) * 100) : 0 };
  });

  let dashIndex = 0;
  const chartDomains: ChartDomain[] = trackedDomains
    .filter(d => {
      const vals = dates.map(date => dailyMeans[date]?.[d]).filter((v): v is number => v != null);
      return vals.length >= 7;
    })
    .map(domain => {
      const vals = dates.map(date => dailyMeans[date]?.[domain] ?? null).filter((v): v is number => v != null);
      const observedMin = vals.length > 0 ? Math.min(...vals) : 1;
      const observedMax = vals.length > 0 ? Math.max(...vals) : 10;
      const result: ChartDomain = {
        domain,
        points: dates.map(date => ({ date, value: dailyMeans[date]?.[domain] ?? null })),
        baseline: baselineMap[domain] ?? 5,
        dashPattern: DASH_PATTERNS[dashIndex % DASH_PATTERNS.length],
        observedMin,
        observedMax,
      };
      dashIndex++;
      return result;
    });

  const chartHasEnoughData = dates.length >= 7 && chartDomains.some(cd => cd.points.filter(p => p.value != null).length >= 7);

  const chartMarkers: ChartMarker[] = markers.flatMap(m => {
    const idx = dates.indexOf(m.marker_date);
    if (idx === -1) return [];
    return [{ dateIndex: idx, markerType: m.marker_type, label: m.label }];
  });

  const currentRollingMedians: Record<string, number> = {};
  for (const domain of trackedDomains) {
    const vals = dates.map(date => dailyMeans[date]?.[domain]).filter((v): v is number => v != null);
    if (vals.length > 0) currentRollingMedians[domain] = median(vals);
  }

  const sleepVals = dates.map(date => dailyMeans[date]?.['sleep']).filter((v): v is number => v != null);
  if (sleepVals.length > 0) currentRollingMedians['sleep'] = median(sleepVals);

  return { dates, dailyMeans, trackedDomains, chartDomains, domainCoverage, chartMarkers, chartHasEnoughData, currentRollingMedians };
}

/**
 * Body's analog of the chartDomains construction above — points mapped over
 * the report's full `dates` axis (not a body-specific range) so
 * bodyChartDomains shares the exact same x-axis as mind's chartDomains and
 * sparklineMarkerXFraction lands correctly for both. Ported from the web
 * app's generateReport.ts's buildBodyChartDomains, unchanged.
 *
 * Unlike buildChartCoordinates' 7-day minimum for chartDomains (a lenient
 * ~8% bar against a typical 90-day window), no minimum is applied here:
 * bodyTrackedDomains already means "at least one logged value" (see
 * computeBodySummaries), and body's logging history is often much shorter —
 * a required, every-evening domain like exhaustion should still get a row
 * even with only a handful of days behind it. renderSparklineSvg already
 * falls back to an empty string for a domain with zero points; a domain
 * with a few real points now draws an honestly-sparse line instead of not
 * appearing at all.
 */
export function buildBodyChartDomains(
  bodyDayScores: { date: string; scores: Record<string, number | undefined> }[],
  bodyTrackedDomains: string[],
  dates: string[],
  bodyBaselineMap: Record<string, number>,
): ChartDomain[] {
  const scoresByDate = new Map(bodyDayScores.map(d => [d.date, d.scores]));
  return bodyTrackedDomains.map(domain => {
    const vals = dates.map(date => scoresByDate.get(date)?.[domain] ?? null).filter((v): v is number => v != null);
    return {
      domain,
      points: dates.map(date => ({ date, value: scoresByDate.get(date)?.[domain] ?? null })),
      baseline: bodyBaselineMap[domain] ?? 5,
      dashPattern: '',
      observedMin: vals.length > 0 ? Math.min(...vals) : 1,
      observedMax: vals.length > 0 ? Math.max(...vals) : 10,
    };
  });
}

/** Just the sleep-vs-domain half of chartMath.ts's computeConnections — a
 *  simple good-sleep/poor-sleep mean split, not a Pearson correlation, so
 *  it doesn't need the significance-testing math the domain-pairwise half
 *  (deferred) does. */
export function computeSleepConnections(dates: string[], dailyMeans: DailyMeans, trackedDomains: string[]): SleepConnection[] {
  if (!trackedDomains.includes('sleep')) return [];
  const nonSleep = trackedDomains.filter(d => d !== 'sleep');
  const sleep: SleepConnection[] = [];
  nonSleep.forEach(domainKey => {
    const poorVals: number[] = []; const goodVals: number[] = [];
    dates.forEach(date => {
      const sleepVal = dailyMeans[date]?.['sleep'];
      const val = dailyMeans[date]?.[domainKey];
      if (sleepVal == null || val == null) return;
      if (sleepVal <= 2) poorVals.push(val);
      else if (sleepVal > 3) goodVals.push(val);
    });
    if (poorVals.length < 4 || goodVals.length < 4) return;
    const diff = mean(goodVals) - mean(poorVals);
    if (Math.abs(diff) < 1.5) return;
    sleep.push({ domain: domainKey, observation: diff > 0 ? 'Tends to be lower after poor sleep' : 'Tends to be higher after poor sleep' });
  });
  return sleep;
}

/** The domain-pairwise half of chartMath.ts's computeConnections — Pearson
 *  correlation gated by detection/compute-connection.ts's overlap/
 *  significance thresholds. */
export function computeDomainConnections(dates: string[], dailyMeans: DailyMeans, trackedDomains: string[]): DomainConnection[] {
  const nonSleep = trackedDomains.filter(d => d !== 'sleep');
  const domain: DomainConnection[] = [];
  for (let i = 0; i < nonSleep.length; i++) {
    for (let j = i + 1; j < nonSleep.length; j++) {
      const a = nonSleep[i]; const b = nonSleep[j];
      const xs: number[] = []; const ys: number[] = [];
      dates.forEach(date => {
        const va = dailyMeans[date]?.[a]; const vb = dailyMeans[date]?.[b];
        if (va != null && vb != null) { xs.push(va); ys.push(vb); }
      });
      const raw = computeRawConnection(xs, ys);
      if (raw.direction !== 'none') {
        domain.push({ domainA: a, domainB: b, direction: raw.direction === 'together' ? 'positive' : 'negative', n: xs.length });
      }
    }
  }
  return domain;
}
