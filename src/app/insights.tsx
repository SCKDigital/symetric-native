import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { CircadianPattern, fetchCircadianPatterns, formatCircadianPattern } from '@/lib/circadian-detection';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { parseDateString } from '@/lib/date-utils';
import { DOMAIN_NAMES } from '@/lib/domains';
import { runPatternDetectionIfNeeded } from '@/lib/pattern-detection-scheduler';
import { DetectedCluster, DomainType } from '@/lib/supabase';

const CLUSTER_TYPE_LABEL: Record<string, string> = {
  sustained_deviation: 'Sustained pattern',
  intraday_volatility: 'Volatility spike',
  rapid_cycling: 'Rapid cycling',
  expiry_correlated: 'Expiry-correlated',
  baseline_shift: 'Baseline shift',
};

function domainLabel(domain: string): string {
  if (domain === 'sleep') return 'Sleep';
  return DOMAIN_NAMES[domain as DomainType] ?? domain;
}

function formatRange(cluster: DetectedCluster): string {
  const start = parseDateString(cluster.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (!cluster.end_date) return `${start} · ongoing`;
  if (cluster.end_date === cluster.start_date) return start;
  const end = parseDateString(cluster.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${start} – ${end}`;
}

function CircadianSection({ patterns }: { patterns: CircadianPattern[] }) {
  if (patterns.length === 0) return null;
  return (
    <View style={styles.circadianSection}>
      <Text style={styles.sectionLabel}>Time of day</Text>
      <View style={styles.circadianList}>
        {patterns.map(p => {
          const formatted = formatCircadianPattern(p);
          return (
            <View key={p.domain} style={styles.circadianCard}>
              <Text style={styles.circadianDomain}>{formatted.domain}</Text>
              <Text style={styles.circadianBody}>
                Highest {p.highest_block}, lowest {p.lowest_block} · range {formatted.range}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Chunk 1+2 of the multi-session Insights port: cluster detection (chunk 1)
// + circadian pattern detection (chunk 2 — closes the gap chunk 1 left in
// cluster-detection.ts, since the web app runs it inline from the same
// detector pass). This screen is deliberately NOT the web app's
// InsightsScreen.tsx — no RangeControl, WhatStandsOut, AreaIndex,
// PinnedConnections, or area drill-downs, since those combine findings from
// detector modules that aren't ported yet (day-of-week, lag relationships,
// pattern evolution, rare events, body detectors, correlations). Just a
// real, honest list of detected clusters and time-of-day patterns.
export default function InsightsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<DetectedCluster[]>([]);
  const [circadianPatterns, setCircadianPatterns] = useState<CircadianPattern[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      await runPatternDetectionIfNeeded(user.id);
    } catch (e) {
      console.error('[InsightsScreen] pattern detection error:', e);
    }

    const to = new Date().toLocaleDateString('en-CA');
    const from = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toLocaleDateString('en-CA');
    })();

    const [clusterData, circadianData] = await Promise.all([fetchClustersForDateRange(user.id, from, to), fetchCircadianPatterns(user.id, from)]);
    const sorted = [...clusterData].sort((a, b) => (b.sort_weight ?? 0) - (a.sort_weight ?? 0));
    setClusters(sorted as DetectedCluster[]);
    setCircadianPatterns(circadianData);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <PulseLoadingScreen />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={clusters}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Insights</Text>
            <CircadianSection patterns={circadianPatterns} />
            {clusters.length > 0 && <Text style={styles.sectionLabel}>Patterns</Text>}
          </>
        }
        renderItem={({ item }) => {
          const domains = (item.domains_involved ?? []).map(domainLabel).join(' + ');
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardDomains}>{domains || 'Pattern'}</Text>
                <Text style={styles.cardRange}>{formatRange(item)}</Text>
              </View>
              <Text style={styles.cardType}>
                {CLUSTER_TYPE_LABEL[item.cluster_type ?? ''] ?? item.cluster_type}
                {item.direction ? ` · ${item.direction}` : ''}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          circadianPatterns.length > 0 ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyHeading}>Not enough data yet</Text>
              <Text style={styles.emptyBody}>Patterns appear here once there’s enough check-in history to detect them.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 8 },
  heading: { fontSize: 26, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.6, marginBottom: 20 },
  sectionLabel: { fontSize: 11, color: '#818cf8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 10 },
  circadianSection: { marginBottom: 24 },
  circadianList: { gap: 8 },
  circadianCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 16, paddingHorizontal: 20 },
  circadianDomain: { fontSize: 14, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  circadianBody: { fontSize: 12.5, color: '#8892a4', textTransform: 'capitalize' },
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 18, paddingHorizontal: 20, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  cardDomains: { fontSize: 15, fontWeight: '500', color: '#e2e8f0' },
  cardRange: { fontSize: 12, color: '#4a5568' },
  cardType: { fontSize: 13, color: '#8892a4', textTransform: 'capitalize' },
  empty: { paddingTop: 60, alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  emptyHeading: { fontSize: 16, fontWeight: '600', color: '#cbd5e0' },
  emptyBody: { fontSize: 13, color: '#4a5568', textAlign: 'center', lineHeight: 19 },
});
