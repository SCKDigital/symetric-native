// Ported from the web app's src/utils/priorityScoring.ts, unchanged — an
// internal sort weight for detected clusters, never shown to users.

import { parseDateString } from '@/lib/date-utils';

interface ClusterForScoring {
  cluster_type: string;
  direction?: string | null;
  domains_involved?: string[];
  severity_score?: number | null;
  volatility_score?: number | null;
  start_date: string;
  end_date?: string | null;
  ongoing?: boolean;
  data_quality?: 'solid' | 'partial' | 'limited' | null;
  high_despite_poor_sleep?: boolean | null;
  improved_with_sleep?: boolean | null;
}

function clusterDurationDays(cluster: ClusterForScoring): number {
  if (!cluster.end_date) return 1;
  return Math.round((parseDateString(cluster.end_date).getTime() - parseDateString(cluster.start_date).getTime()) / 86400000) + 1;
}

/**
 * Returns a numeric priority weight for sorting clusters in the Insights UI.
 * Higher weight = shown first.
 *
 * Factors (all internal, not surfaced in UI):
 * - Multi-domain patterns score higher
 * - Longer sustained periods score higher
 * - High-volatility and rapid-cycling score higher
 * - Sleep-independent elevated energy gets a large bonus (differential marker)
 * - Sleep-responsive patterns get a small bonus
 * - Severity score is used as a multiplier
 * - Partial/limited data quality reduces weight
 */
export function calculateSortWeight(cluster: ClusterForScoring): number {
  let weight = 1.0;

  const domainCount = cluster.domains_involved?.length ?? 1;

  if (domainCount >= 3) {
    weight += 1.5;
  } else if (domainCount >= 2) {
    weight += 0.8;
  }

  if (cluster.cluster_type === 'sustained_deviation') {
    const days = clusterDurationDays(cluster);
    if (days >= 21) weight += 1.2;
    else if (days >= 14) weight += 0.8;
    else if (days >= 7) weight += 0.4;
    if (cluster.ongoing) weight += 0.5;
  }

  if (cluster.cluster_type === 'intraday_volatility') {
    const swing = cluster.volatility_score ?? 4;
    if (swing >= 7) weight += 1.0;
    else if (swing >= 5) weight += 0.5;
  }

  if (cluster.cluster_type === 'rapid_cycling') {
    weight += 1.3;
  }

  if (cluster.high_despite_poor_sleep) {
    weight += 1.5;
  }
  if (cluster.improved_with_sleep) {
    weight += 0.6;
  }

  if (cluster.severity_score != null && cluster.severity_score > 0) {
    const normalised = Math.min(cluster.severity_score / 5, 3.0);
    weight *= normalised;
  }

  if (cluster.data_quality === 'partial') {
    weight *= 0.8;
  } else if (cluster.data_quality === 'limited') {
    weight *= 0.6;
  }

  return Math.round(weight * 100) / 100;
}
