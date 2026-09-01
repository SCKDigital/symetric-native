import { interventionImpactFindings, type Grade, type PatternFinding } from '@/lib/pattern-findings';
import { patternEvolutionHeadline, patternEvolutionStatLine } from '@/lib/report/chart-utils';
import { DOMAIN_LABELS, LOWER_IS_BETTER, theme } from '@/lib/report/theme';
import type { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { CircadianPattern } from '@/lib/circadian-detection';
import type { DetectedCluster } from '@/lib/supabase';

// Scoped port of the web app's lib/report/sections/reportFindings.tsx —
// only buildUnifiedFindings' mind-domain sections (clusters, lag
// relationships, day-of-week, circadian, rare events, pattern evolution,
// medication impact) plus the small color/label helpers Page 1 needs.
// Domain connections (section 2 in the web source) are omitted — that
// needs buildChartCoordinates/computeConnections from chartUtils.ts,
// deferred to a later report chunk. Every body-domain section (10) is
// omitted entirely, same mind-only scoping as the rest of this port.
// NOT ported yet: DomainSummaryTable/BodySummaryTable/PatternCard/
// EpisodeTimeline/RareEventsSection/DomainSparklineSection as reusable
// components — Page 1's HTML template in generate-report.ts inlines the
// small pieces of this it needs directly, since there's no @react-pdf/
// renderer component tree here, just an HTML string for expo-print.

export type Tier = 'high' | 'moderate' | 'early';

export interface UnifiedFinding {
  id: string;
  tier: Tier;
  headline: string;
  statLine: string;
  sortKey: number;
  domains: string[];
  kind: string;
}

const TIER_ORDER: Record<Tier, number> = { high: 0, moderate: 1, early: 2 };

function dataQualityToTier(q: string | null | undefined): Tier {
  if (q === 'solid') return 'high';
  if (q === 'partial') return 'moderate';
  return 'early';
}

function tierFromGrade(g: Grade): Tier {
  if (g === 'solid') return 'high';
  if (g === 'partial') return 'moderate';
  return 'early';
}

function toUnified(idPrefix: string, kind: string, f: PatternFinding): UnifiedFinding {
  return {
    id: `${idPrefix}:${f.id}`,
    tier: tierFromGrade(f.grade),
    headline: f.sentence,
    statLine: f.evidenceLine,
    sortKey: f.effectSize,
    domains: f.sentenceHighlights.map(h => h.factor),
    kind,
  };
}

export function plainPatternHeadline(cluster: DetectedCluster): string {
  const domains = (cluster.domains_involved ?? []).map(d => DOMAIN_LABELS[d] ?? d).join(', ') || 'Multiple domains';
  switch (cluster.cluster_type) {
    case 'sustained_deviation':
      return cluster.direction === 'elevated'
        ? `${domains} - sustained above baseline`
        : cluster.direction === 'depressed'
        ? `${domains} - sustained below baseline`
        : `${domains} - sustained deviation`;
    case 'intraday_volatility': return `${domains} - high within-day variation`;
    case 'rapid_cycling': return `${domains} - rapid alternation above and below baseline`;
    case 'baseline_shift': return `${domains} - baseline shift`;
    default: return `${domains} - pattern detected`;
  }
}

export interface UnifiedFindingsInput {
  flaggedClusters: DetectedCluster[];
  lagRelationships: LagRelationship[];
  dayOfWeekPatterns: DayOfWeekPattern[];
  circadianPatterns: CircadianPattern[];
  rareEvents: RareEvent[];
  patternEvolution: PatternEvolution[];
  interventionImpacts: InterventionImpact[];
}

function rareEventLabel(t: string): string {
  switch (t) {
    case 'consecutive_poor_sleep': return 'consecutive poor-sleep episodes';
    case 'all_elevated': return 'all domains simultaneously elevated';
    case 'all_suppressed': return 'all domains simultaneously suppressed';
    case 'extreme_spike': return 'extreme-value spike';
    case 'multi_crash': return 'multi-domain rapid drop';
    default: return 'rare event';
  }
}

export function buildUnifiedFindings(data: UnifiedFindingsInput): UnifiedFinding[] {
  const findings: UnifiedFinding[] = [];

  for (const c of data.flaggedClusters) {
    const end = c.end_date ?? new Date().toISOString().slice(0, 10);
    const days = Math.max(1, Math.round((new Date(end + 'T12:00:00Z').getTime() - new Date(c.start_date + 'T12:00:00Z').getTime()) / 86400000) + 1);
    const startFmt = new Date(c.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const qLabel = c.data_quality === 'solid' ? 'firm' : c.data_quality === 'partial' ? 'partial' : 'early-signal';
    findings.push({
      id: `cluster:${c.id}`,
      tier: dataQualityToTier(c.data_quality),
      headline: plainPatternHeadline(c),
      statLine: `${days} days · from ${startFmt} · ${qLabel} data coverage`,
      sortKey: c.severity_score ?? 0,
      domains: c.domains_involved ?? [],
      kind: plainPatternHeadline(c).split(' - ')[1] ?? 'Pattern detected',
    });
  }

  for (let i = 0; i < data.lagRelationships.length; i++) {
    const r = data.lagRelationships[i];
    const pred = DOMAIN_LABELS[r.predictor as string] ?? r.predictor;
    const outc = DOMAIN_LABELS[r.outcome as string] ?? r.outcome;
    const rate = Math.round(r.instanceRate * 100);
    findings.push({
      id: `lag:${i}`,
      tier: r.instanceRate >= 0.75 ? 'moderate' : 'early',
      headline: `${pred} predicts ${outc} ${r.lagDays} day${r.lagDays !== 1 ? 's' : ''} later`,
      statLine: `${rate}% of occasions · ${r.instanceCount} of ${r.totalPairs} day-pairs`,
      sortKey: r.instanceRate * 100,
      domains: [r.predictor as string, r.outcome as string],
      kind: 'Predictive relationship',
    });
  }

  for (let i = 0; i < data.dayOfWeekPatterns.length; i++) {
    const p = data.dayOfWeekPatterns[i];
    const domLbl = DOMAIN_LABELS[p.domain] ?? p.domain;
    const dir = p.direction === 'elevated' ? 'higher' : 'lower';
    const headline = p.type === 'weekday_weekend'
      ? `${domLbl} - weekday vs weekend difference`
      : `${domLbl} - ${p.dayName}s consistently ${dir}`;
    findings.push({
      id: `dow:${i}`,
      tier: dataQualityToTier(p.dataQuality),
      headline,
      statLine: `${p.difference.toFixed(1)} pt difference · ${p.weekCount} weeks · ${p.consistentWeeks} consistent`,
      sortKey: p.difference,
      domains: [p.domain],
      kind: 'Day-of-week pattern',
    });
  }

  for (let i = 0; i < data.circadianPatterns.length; i++) {
    const p = data.circadianPatterns[i];
    const domLbl = DOMAIN_LABELS[p.domain] ?? p.domain;
    findings.push({
      id: `circ:${i}`,
      tier: p.range >= 2.5 ? 'moderate' : 'early',
      headline: `${domLbl} - time-of-day variation (${p.highest_block} vs ${p.lowest_block})`,
      statLine: `${p.range.toFixed(1)} pt range · ${p.total_checkins} check-ins`,
      sortKey: p.range,
      domains: [p.domain],
      kind: 'Time-of-day pattern',
    });
  }

  for (let i = 0; i < data.rareEvents.length; i++) {
    const ev = data.rareEvents[i];
    const doms = ev.affected_domains.length > 0 ? ev.affected_domains.map(d => DOMAIN_LABELS[d] ?? d).join(', ') : 'Multiple domains';
    const highSeverity = ev.event_type === 'all_elevated' || ev.event_type === 'all_suppressed' || ev.event_type === 'consecutive_poor_sleep' || ev.event_type === 'multi_crash';
    findings.push({
      id: `rare:${i}`,
      tier: highSeverity ? 'moderate' : 'early',
      headline: `${doms} - ${rareEventLabel(ev.event_type)}`,
      statLine: ev.clinical_note,
      sortKey: ev.frequency * 10,
      domains: ev.affected_domains as string[],
      kind: 'Rare event',
    });
  }

  for (let i = 0; i < data.patternEvolution.length; i++) {
    const pe = data.patternEvolution[i];
    const dom = DOMAIN_LABELS[pe.domain] ?? pe.domain;
    findings.push({
      id: `evo:${i}`,
      tier: dataQualityToTier(pe.data_quality),
      headline: `${dom} - ${patternEvolutionHeadline(pe)}`,
      statLine: patternEvolutionStatLine(pe),
      sortKey: pe.change_magnitude,
      domains: [pe.domain],
      kind: patternEvolutionHeadline(pe),
    });
  }

  for (const f of interventionImpactFindings(data.interventionImpacts)) {
    findings.push(toUnified('med', 'Medication effect', f));
  }

  findings.sort((a, b) => {
    const ta = TIER_ORDER[a.tier], tb = TIER_ORDER[b.tier];
    if (ta !== tb) return ta - tb;
    return b.sortKey - a.sortKey;
  });

  return findings;
}

export function patternCardColor(tier: Tier): string {
  if (tier === 'high') return theme.colors.coral;
  if (tier === 'moderate') return theme.colors.amber;
  return theme.colors.gray;
}

export function patternCardBgColor(tier: Tier): string {
  if (tier === 'high') return theme.colors.coralBg;
  if (tier === 'moderate') return theme.colors.amberBg;
  return '#F5F5F4';
}

export function tierLabel(tier: Tier): string {
  if (tier === 'high') return 'Firm';
  if (tier === 'moderate') return 'Partial';
  return 'Early signal';
}

export function fmtVal(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

export function domainDeviationColor(domain: string, currentMedian: number | undefined, baseline: number | undefined): string {
  if (currentMedian == null || baseline == null) return theme.colors.gray;
  const diff = currentMedian - baseline;
  if (Math.abs(diff) < 0.5) return theme.colors.gray;
  const isLowerBetter = LOWER_IS_BETTER.has(domain);
  return (isLowerBetter ? diff > 0 : diff < 0) ? theme.colors.coral : theme.colors.teal;
}

// Real Unicode arrows — the web report substitutes ASCII ('->'/'^'/'v') for
// these because @react-pdf/renderer's Helvetica font has a limited glyph
// set; HTML rendered via expo-print isn't under that constraint.
export function trendArrow(currentMedian: number | undefined, baseline: number | undefined): string {
  if (currentMedian == null || baseline == null) return '–';
  const diff = currentMedian - baseline;
  if (Math.abs(diff) < 0.3) return '→';
  return diff > 0 ? '↑' : '↓';
}
