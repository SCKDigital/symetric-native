import type { PatternEvolution } from '@/lib/detection/pattern-evolution';

// Scoped port of the web app's lib/report/chartUtils.ts — just the two
// plain-language helpers Page 1's pattern findings need. NOT ported yet:
// buildChartCoordinates/computeConnections/buildDailyScoresForDetection/
// computeCycleDayByDate/renderSparklineImages/median — all belong to later
// report chunks (sparkline charts, domain connections, cycle tracking).
// `median` specifically isn't needed here since lib/baseline-stats.ts
// already has one this port reuses instead of duplicating.

export function patternEvolutionHeadline(pe: PatternEvolution): string {
  const worsening = pe.direction === 'worsening';
  switch (pe.evolution_type) {
    case 'baseline_shift':
      return `${pe.direction} trend over the reporting window`;
    case 'volatility_change':
      return worsening ? 'increasingly variable' : 'more stable';
    case 'stability_improvement':
    case 'stability_decline':
      return worsening ? 'less predictable' : 'more predictable';
  }
}

export function patternEvolutionStatLine(pe: PatternEvolution): string {
  const first = pe.first_period_avg.toFixed(1);
  const recent = pe.recent_period_avg.toFixed(1);
  switch (pe.evolution_type) {
    case 'baseline_shift':
      return `Earlier avg ${first} -> recent avg ${recent}, ${pe.change_magnitude.toFixed(1)} pt shift`;
    case 'volatility_change': {
      const pct = Math.round(pe.change_magnitude * 100);
      return `Day-to-day variability changed by ${pct}%, SD ${pe.first_period_volatility.toFixed(2)} -> ${pe.recent_period_volatility.toFixed(2)}`;
    }
    case 'stability_improvement':
    case 'stability_decline': {
      const firstPct = Math.round(pe.first_period_stability * 100);
      const recentPct = Math.round(pe.recent_period_stability * 100);
      return `Days within 1 pt of personal baseline: ${firstPct}% -> ${recentPct}%`;
    }
  }
}
