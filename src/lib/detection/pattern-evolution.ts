import { median as medianOf } from '@/lib/baseline-stats';
import { addDays } from '@/lib/date-utils';
import { debug } from '@/lib/debug';
import { BodyDomainType, DomainType } from '@/lib/supabase';

// Ported from the web app's src/lib/detection/patternEvolution.ts. Widened
// to cover body domains too (body detector sub-series chunk 6) — this
// detector is domain-agnostic (a generic loop over activeDomains, no
// mind-specific assumptions beyond HIGHER_IS_BETTER below), so covering body
// domains is a type-level change only, matching web's TrackedFactor exactly.
export type TrackedFactor = DomainType | BodyDomainType;

export interface PatternEvolution {
  domain: TrackedFactor;
  evolution_type: 'baseline_shift' | 'volatility_change' | 'stability_improvement' | 'stability_decline';
  direction: 'improving' | 'worsening';
  first_period_avg: number;
  recent_period_avg: number;
  change_magnitude: number;
  first_period_volatility: number;
  recent_period_volatility: number;
  first_period_stability: number;
  recent_period_stability: number;
  first_period_start: string;
  first_period_end: string;
  recent_period_start: string;
  recent_period_end: string;
  first_period_count: number;
  recent_period_count: number;
  data_quality: 'solid' | 'partial' | 'limited';
}

interface DayScores {
  date: string;
  scores: Partial<Record<TrackedFactor | 'sleep', number>>;
}

export const MIN_SPAN_DAYS = 60;
const PERIOD_DAYS = 30;
const MIN_SCORES_PERIOD = 10;
const BASELINE_SHIFT_MIN = 1.0;
const VOLATILITY_MIN = 0.3;
const STABILITY_MIN = 0.15;
const MAX_RESULTS = 3;
// Suppress baseline_shift when one window is much sparser than the other.
// Sparse symptom-driven logging biases the median even though median is more
// robust than mean. The bias is small but the comparison is less trustworthy
// when one window has fewer than 60% of the other's logged days.
const DENSITY_RATIO_MIN = 0.6;

// baseline_shift (level change) takes precedence because it is the most
// clinically legible signal. volatility and stability are secondary context.
// Magnitudes are different units across types so cannot be compared directly.
const TYPE_PRIORITY: Record<PatternEvolution['evolution_type'], number> = {
  baseline_shift: 0,
  volatility_change: 1,
  stability_improvement: 2,
  stability_decline: 2,
};

// Body domains are intentionally absent — all of them run "higher = worse"
// (symptom severity), so the default (not in this set) already gives the
// correct improving/worsening direction without listing them explicitly.
const HIGHER_IS_BETTER = new Set<TrackedFactor>(['mood', 'energy', 'concentration', 'social_battery', 'motivation']);

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function stabilityPct(scores: number[], baseline: number): number {
  return scores.filter(s => Math.abs(s - baseline) <= 1).length / scores.length;
}

function dataQuality(minCount: number): 'solid' | 'partial' | 'limited' {
  if (minCount >= 20) return 'solid';
  if (minCount >= 10) return 'partial';
  return 'limited';
}

export function detectPatternEvolution(days: DayScores[], activeDomains: TrackedFactor[], baselines: Partial<Record<TrackedFactor | 'sleep', number>>): PatternEvolution[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;
  const spanDays = Math.round((new Date(lastDate + 'T12:00:00Z').getTime() - new Date(firstDate + 'T12:00:00Z').getTime()) / 86_400_000);
  if (spanDays < MIN_SPAN_DAYS) return [];

  const firstPeriodEnd = addDays(firstDate, PERIOD_DAYS - 1);
  const recentPeriodStart = addDays(lastDate, -(PERIOD_DAYS - 1));

  const firstDays = sorted.filter(d => d.date <= firstPeriodEnd);
  const recentDays = sorted.filter(d => d.date >= recentPeriodStart);

  const results: PatternEvolution[] = [];

  for (const domain of activeDomains) {
    const firstScores = firstDays.map(d => d.scores[domain]).filter((s): s is number => s !== undefined);
    const recentScores = recentDays.map(d => d.scores[domain]).filter((s): s is number => s !== undefined);

    if (firstScores.length < MIN_SCORES_PERIOD || recentScores.length < MIN_SCORES_PERIOD) continue;

    const baseline = baselines[domain] ?? 5;

    const firstAvg = medianOf(firstScores);
    const recentAvg = medianOf(recentScores);
    const avgShift = Math.abs(recentAvg - firstAvg);

    const firstVol = stdDev(firstScores);
    const recentVol = stdDev(recentScores);
    const volPct = firstVol > 0.1 ? Math.abs(recentVol - firstVol) / firstVol : 0;

    const firstStab = stabilityPct(firstScores, baseline);
    const recentStab = stabilityPct(recentScores, baseline);
    const stabDiff = Math.abs(recentStab - firstStab);

    type Candidate = { type: PatternEvolution['evolution_type']; magnitude: number; direction: 'improving' | 'worsening' };
    const candidates: Candidate[] = [];

    if (avgShift >= BASELINE_SHIFT_MIN) {
      const densityRatio = Math.min(firstScores.length, recentScores.length) / Math.max(firstScores.length, recentScores.length);
      if (densityRatio >= DENSITY_RATIO_MIN) {
        const up = recentAvg >= firstAvg;
        const hib = HIGHER_IS_BETTER.has(domain);
        candidates.push({ type: 'baseline_shift', magnitude: avgShift, direction: up === hib ? 'improving' : 'worsening' });
      }
    }

    if (volPct >= VOLATILITY_MIN) {
      candidates.push({ type: 'volatility_change', magnitude: volPct, direction: recentVol < firstVol ? 'improving' : 'worsening' });
    }

    if (stabDiff >= STABILITY_MIN) {
      candidates.push({ type: recentStab > firstStab ? 'stability_improvement' : 'stability_decline', magnitude: stabDiff, direction: recentStab > firstStab ? 'improving' : 'worsening' });
    }

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => {
      const pa = TYPE_PRIORITY[a.type];
      const pb = TYPE_PRIORITY[b.type];
      if (pa !== pb) return pa - pb;
      return b.magnitude - a.magnitude;
    });
    const best = candidates[0];

    results.push({
      domain,
      evolution_type: best.type,
      direction: best.direction,
      first_period_avg: firstAvg,
      recent_period_avg: recentAvg,
      change_magnitude: best.magnitude,
      first_period_volatility: firstVol,
      recent_period_volatility: recentVol,
      first_period_stability: firstStab,
      recent_period_stability: recentStab,
      first_period_start: firstDate,
      first_period_end: firstPeriodEnd,
      recent_period_start: recentPeriodStart,
      recent_period_end: lastDate,
      first_period_count: firstScores.length,
      recent_period_count: recentScores.length,
      data_quality: dataQuality(Math.min(firstScores.length, recentScores.length)),
    });
  }

  debug.log('PatternEvolution', `Detected ${results.length} evolutions`);
  return results
    .sort((a, b) => {
      const pa = TYPE_PRIORITY[a.evolution_type];
      const pb = TYPE_PRIORITY[b.evolution_type];
      if (pa !== pb) return pa - pb;
      return b.change_magnitude - a.change_magnitude;
    })
    .slice(0, MAX_RESULTS);
}
