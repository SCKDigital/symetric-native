import { DetectedCluster } from '@/lib/supabase';

// Ported from the web app's src/utils/volatilityAggregation.ts, unchanged —
// pure logic, no browser APIs.

export interface VolatilityGroup {
  /** Synthetic key for React/PDF use */
  id: string;
  domain: string;
  /** Individual volatile-day clusters, sorted ascending by date */
  clusters: DetectedCluster[];
  startDate: string;
  endDate: string;
  dayCount: number;
  /** Min swing magnitude across all days in this group (from volatility_score) */
  swingMin: number;
  /** Max swing magnitude across all days in this group (from volatility_score) */
  swingMax: number;
}

function hasConsecutiveDays(clusters: DetectedCluster[]): boolean {
  const dates = [...clusters].map(c => c.start_date).sort();
  for (let i = 1; i < dates.length; i++) {
    const prevMs = new Date(dates[i - 1] + 'T12:00:00').getTime();
    const currMs = new Date(dates[i] + 'T12:00:00').getTime();
    if (Math.round((currMs - prevMs) / 86400000) === 1) return true;
  }
  return false;
}

function meetsThreshold(group: { clusters: DetectedCluster[]; dayCount: number }): boolean {
  if (group.dayCount >= 3) return true;
  if (hasConsecutiveDays(group.clusters)) return true; // 2+ consecutive days
  if (group.clusters.some(c => (c.volatility_score ?? 0) >= 6)) return true; // severe swing
  if (group.clusters.some(c => c.flagged_for_report)) return true;
  return false;
}

/**
 * Groups intraday_volatility clusters by domain and 7-day temporal proximity,
 * then filters to groups that meet clinical relevance thresholds.
 *
 * Returns groups sorted by day count descending (most volatile first),
 * with end date as tiebreaker.
 */
export function aggregateVolatilityGroups(clusters: DetectedCluster[]): VolatilityGroup[] {
  const volClusters = clusters.filter(c => c.cluster_type === 'intraday_volatility');

  // Group by domain
  const byDomain = new Map<string, DetectedCluster[]>();
  volClusters.forEach(c => {
    const domain = c.domains_involved?.[0] ?? 'mood';
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(c);
  });

  const groups: VolatilityGroup[] = [];

  byDomain.forEach((domClusters, domain) => {
    const sorted = [...domClusters].sort((a, b) => a.start_date.localeCompare(b.start_date));

    // Group by 7-day proximity (measured from the last cluster in current group)
    const rawGroups: DetectedCluster[][] = [];
    let current: DetectedCluster[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const lastMs = new Date(current[current.length - 1].start_date + 'T12:00:00').getTime();
      const currMs = new Date(sorted[i].start_date + 'T12:00:00').getTime();
      const daysDiff = Math.round((currMs - lastMs) / 86400000);

      if (daysDiff <= 7) {
        current.push(sorted[i]);
      } else {
        rawGroups.push(current);
        current = [sorted[i]];
      }
    }
    rawGroups.push(current);

    rawGroups.forEach(groupClusters => {
      const candidate = {
        clusters: groupClusters,
        dayCount: groupClusters.length,
      };
      if (!meetsThreshold(candidate)) return;

      const swings = groupClusters
        .map(c => c.volatility_score)
        .filter((s): s is number => s != null);
      const swingMin = swings.length > 0 ? Math.min(...swings) : 4;
      const swingMax = swings.length > 0 ? Math.max(...swings) : 4;

      groups.push({
        id: `vol_${domain}_${groupClusters[0].start_date}`,
        domain,
        clusters: groupClusters,
        startDate: groupClusters[0].start_date,
        endDate: groupClusters[groupClusters.length - 1].start_date,
        dayCount: groupClusters.length,
        swingMin,
        swingMax,
      });
    });
  });

  // Sort: most days first, then most severe swing, then most recent
  return groups.sort((a, b) =>
    b.dayCount - a.dayCount ||
    b.swingMax - a.swingMax ||
    b.endDate.localeCompare(a.endDate)
  );
}
