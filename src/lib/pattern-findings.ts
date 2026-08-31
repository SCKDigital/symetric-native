// Scoped port of the web app's src/lib/patternFindings.ts (441 lines) — the
// presentation/composition layer that normalises detector output into one
// shared PatternFinding shape, which "What stands out" is built from.
//
// Only the functions for detectors already ported are here: clusterFindings,
// dayOfWeekFindings, lagRelationshipFindings, patternEvolutionFindings. NOT
// ported yet (each needs a detector module not on native yet):
// sleepConnectionFindings, interventionImpactFindings, rareEventFindings,
// bodyMindConnectionFindings, bodyTimeOfDayFindings,
// bodyEventFrequencyFindings, bodyEventImpactFindings — port each one
// alongside its source detector, same pattern as this file's own history.
//
// Pure, synchronous, no DB/network access — callers fetch data, this module
// only shapes it. Do not add detection logic here.

import { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import { LagRelationship } from '@/lib/detection/lag-relationships';
import { PatternEvolution } from '@/lib/detection/pattern-evolution';
import { parseDateString } from '@/lib/date-utils';
import { DOMAIN_COPY } from '@/lib/domains';
import { DetectedCluster, PatternSource } from '@/lib/supabase';

/**
 * True for a body-tracking domain. Always false on native for now — body
 * check-ins aren't ported yet, so no body domain type exists to check
 * against. Kept as a named function (rather than inlined `false`) so every
 * call site here already reads correctly once body domains do exist —
 * update only this one function, not its callers.
 */
export function isBodyDomain(_d: string): boolean {
  return false;
}

/** Resolves a display label for any tracked factor — mind domain or 'sleep'. */
export function factorLabel(d: string): string {
  if (d === 'sleep') return 'Sleep';
  return DOMAIN_COPY[d as keyof typeof DOMAIN_COPY]?.label ?? d;
}

export type Grade = 'solid' | 'partial' | 'limited';
export type Area = 'mind' | 'body' | 'sleep' | 'medication';

export const GRADE_ORDER: Record<Grade, number> = { solid: 0, partial: 1, limited: 2 };

/** Reader-facing confidence copy — must match the PDF report's tier legend word for word. */
export const CONFIDENCE_COPY: Record<Grade, { short: string; full: string; barFraction: number }> = {
  solid: { short: 'Firm', full: 'Firm: enough data to stand on', barFraction: 1.0 },
  partial: { short: 'Partial', full: 'Partial: worth watching another few weeks', barFraction: 0.6 },
  limited: { short: 'Early signal', full: 'Early signal', barFraction: 0.3 },
};

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

function fmtShort(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Normalizes a cluster's data_quality into a Grade. Accepts a loose string
 * because some historical rows may carry the legacy 'full' literal that
 * predates the 'solid' rename.
 */
export function normalizeClusterGrade(dq: string | null | undefined): Grade {
  if (dq === 'full' || dq === 'solid') return 'solid';
  if (dq === 'partial') return 'partial';
  return 'limited';
}

export function clusterDurationDays(c: DetectedCluster, todayStr: string): number {
  const end = c.ongoing ? todayStr : (c.end_date ?? c.start_date);
  return Math.round((parseDateString(end).getTime() - parseDateString(c.start_date).getTime()) / 86_400_000) + 1;
}

export interface SentenceHighlight {
  text: string;
  factor: string;
}

export interface PatternFinding {
  id: string;
  patternSource: PatternSource | null;
  patternId: string | null;
  areas: Area[];
  grade: Grade;
  onsetDate: string;
  effectSize: number;
  sentence: string;
  sentenceHighlights: SentenceHighlight[];
  evidenceLine: string;
}

// ── Mind/body: sustained/cycling clusters ─────────────────────────────────────

export function clusterFindings(clusters: DetectedCluster[], todayStr = today()): PatternFinding[] {
  return clusters
    .filter(c => c.cluster_type === 'sustained_deviation' || c.cluster_type === 'rapid_cycling')
    .map(c => {
      const grade = normalizeClusterGrade(c.data_quality);
      const domain = c.domains_involved?.[0];
      const label = domain ? factorLabel(domain) : 'Mood';
      const days = clusterDurationDays(c, todayStr);
      const primaryArea: Area = domain && isBodyDomain(domain) ? 'body' : 'mind';
      const areas: Area[] = c.high_despite_poor_sleep || c.improved_with_sleep ? [primaryArea, 'sleep'] : [primaryArea];
      const highlights: SentenceHighlight[] = [{ text: label, factor: domain ?? 'mood' }];

      let sentence: string;
      if (c.high_despite_poor_sleep) {
        sentence = `${label} stayed elevated even when sleep was poor, for ${days} day${days !== 1 ? 's' : ''}.`;
        highlights.push({ text: 'sleep', factor: 'sleep' });
      } else if (c.cluster_type === 'rapid_cycling') {
        sentence = `${label} alternated between elevated and low over ${days} days${c.ongoing ? ', and is still going' : ''}.`;
      } else {
        const qualifier = c.direction === 'elevated' ? 'higher' : 'lower';
        sentence = `${label} has been consistently ${qualifier} than usual for ${days} day${days !== 1 ? 's' : ''}${c.ongoing ? ' and counting' : ''}.`;
      }

      const checkIns = c.data_points_used;
      const evidenceLine = [checkIns != null ? `${checkIns} check-in${checkIns !== 1 ? 's' : ''}` : null, `${days} day${days !== 1 ? 's' : ''}${c.ongoing ? ' (ongoing)' : ''}`].filter(Boolean).join(' · ');

      return {
        id: c.id,
        patternSource: 'cluster' as PatternSource,
        patternId: c.id,
        areas,
        grade,
        onsetDate: c.ongoing ? todayStr : (c.end_date ?? c.start_date),
        effectSize: (c.severity_score ?? 0) + (c.high_despite_poor_sleep ? 5 : 0),
        sentence,
        sentenceHighlights: highlights,
        evidenceLine,
      };
    });
}

// ── Mind/body: day-of-week patterns (Insights-only — no Prepare persistence) ─

export function dayOfWeekFindings(patterns: DayOfWeekPattern[]): PatternFinding[] {
  return patterns.map((pat, i) => {
    const label = factorLabel(pat.domain);
    const diff = pat.difference.toFixed(1);
    const hl = pat.direction === 'elevated' ? 'higher' : 'lower';
    const period = pat.type === 'weekday_weekend' ? (pat.direction === 'elevated' ? 'weekends' : 'weekdays') : `${pat.dayName}s`;
    return {
      id: `dow-${pat.domain}-${pat.type}-${i}`,
      patternSource: null,
      patternId: null,
      areas: [isBodyDomain(pat.domain) ? 'body' : 'mind'] as Area[],
      grade: pat.dataQuality,
      onsetDate: today(),
      effectSize: pat.difference,
      sentence: `${label} runs ${diff} points ${hl} on ${period}, holding true in ${pat.consistentWeeks} of ${pat.weekCount} weeks.`,
      sentenceHighlights: [{ text: label, factor: pat.domain }],
      evidenceLine: `Observed in ${pat.consistentWeeks} of ${pat.weekCount} weeks`,
    };
  });
}

// ── Mind/body/sleep: lag (predictive) relationships (Insights-only) ──────────

export function lagRelationshipFindings(rels: LagRelationship[]): PatternFinding[] {
  return rels.map(rel => {
    const grade: Grade = rel.instanceRate >= 0.8 && rel.totalPairs >= 30 ? 'solid' : 'partial';
    const predLabel = rel.predictor === 'sleep' ? 'sleep quality' : factorLabel(rel.predictor);
    const outLabel = factorLabel(rel.outcome);
    const lagStr = rel.lagDays === 1 ? 'the next day' : 'two days later';
    const predictorArea: Area = rel.predictor === 'sleep' ? 'sleep' : isBodyDomain(rel.predictor) ? 'body' : 'mind';
    const outcomeArea: Area = isBodyDomain(rel.outcome) ? 'body' : 'mind';
    const areas: Area[] = [...new Set([predictorArea, outcomeArea])];
    const highlights: SentenceHighlight[] = [
      { text: predLabel, factor: rel.predictor },
      { text: outLabel, factor: rel.outcome },
    ];
    return {
      id: `lag-${rel.predictor}-${rel.outcome}-${rel.lagDays}`,
      patternSource: null,
      patternId: null,
      areas,
      grade,
      onsetDate: today(),
      effectSize: Math.abs(rel.correlation),
      sentence: `When ${predLabel} shifts, ${outLabel} tends to follow ${lagStr}, holding true in ${rel.instanceCount} of ${rel.totalPairs} instances.`,
      sentenceHighlights: highlights,
      evidenceLine: `Held in ${rel.instanceCount} of ${rel.totalPairs} instances checked`,
    };
  });
}

// ── Mind/body: first-month-vs-this-month evolution (What stands out only —
// no dedicated detail-view section; the summary already covers this) ────────

export function patternEvolutionFindings(evos: PatternEvolution[]): PatternFinding[] {
  return evos.map(evo => {
    const label = factorLabel(evo.domain);
    const totalCheckIns = evo.first_period_count + evo.recent_period_count;
    let sentence: string;
    if (evo.evolution_type === 'baseline_shift') {
      sentence = `${label} has shifted from around ${evo.first_period_avg.toFixed(1)} to around ${evo.recent_period_avg.toFixed(1)} since you started tracking.`;
    } else if (evo.evolution_type === 'volatility_change') {
      sentence = evo.direction === 'improving' ? `${label} has settled down day to day compared to when you started tracking.` : `${label} has been moving around more day to day compared to when you started tracking.`;
    } else {
      sentence = evo.direction === 'improving' ? `${label} has become more stable since you started tracking.` : `${label} has become less stable since you started tracking.`;
    }
    return {
      id: `evo-${evo.domain}-${evo.evolution_type}`,
      patternSource: null,
      patternId: null,
      areas: [isBodyDomain(evo.domain) ? 'body' : 'mind'] as Area[],
      grade: evo.data_quality,
      onsetDate: evo.recent_period_end,
      effectSize: evo.change_magnitude,
      sentence,
      sentenceHighlights: [{ text: label, factor: evo.domain }],
      evidenceLine: `${totalCheckIns} check-ins · ${fmtShort(evo.first_period_start)} to ${fmtShort(evo.first_period_end)} vs ${fmtShort(evo.recent_period_start)} to ${fmtShort(evo.recent_period_end)}`,
    };
  });
}
