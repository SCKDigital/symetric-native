import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { CircadianPattern, fetchCircadianPatterns, formatCircadianPattern } from '@/lib/circadian-detection';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { buildDayScores } from '@/lib/day-scores';
import { parseDateString } from '@/lib/date-utils';
import { DayOfWeekPattern, detectDayOfWeekPatterns } from '@/lib/detection/day-of-week-patterns';
import { detectLagRelationships, LagRelationship } from '@/lib/detection/lag-relationships';
import { detectPatternEvolution, PatternEvolution } from '@/lib/detection/pattern-evolution';
import { DOMAIN_NAMES, resolveActiveDomains } from '@/lib/domains';
import { runPatternDetectionIfNeeded } from '@/lib/pattern-detection-scheduler';
import { clusterFindings, dayOfWeekFindings, lagRelationshipFindings, patternEvolutionFindings, PatternFinding } from '@/lib/pattern-findings';
import { selectStandoutFindings } from '@/lib/standout-ranking';
import { Baseline, CheckIn, DetectedCluster, DomainType, SleepLog, supabase } from '@/lib/supabase';

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

function formatDayOfWeekPattern(p: DayOfWeekPattern): string {
  const label = domainLabel(p.domain);
  const dir = p.direction === 'elevated' ? 'higher' : 'lower';
  if (p.type === 'weekday_weekend') {
    return `${label} tends to be ${dir} on weekends than weekdays`;
  }
  return `${label} tends to be ${dir} on ${p.dayName}s`;
}

function formatLagRelationship(r: LagRelationship): string {
  const predictorLabel = domainLabel(r.predictor);
  const outcomeLabel = domainLabel(r.outcome);
  const relation = r.direction === 'positive' ? 'tends to come with' : 'tends to come with the opposite of';
  const dayWord = r.lagDays === 1 ? 'the next day' : `${r.lagDays} days later`;
  return `Higher ${predictorLabel.toLowerCase()} ${relation} ${outcomeLabel.toLowerCase()} ${dayWord}`;
}

function WhatStandsOut({ findings }: { findings: PatternFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>What stands out</Text>
      <View style={styles.sectionList}>
        {findings.map(f => (
          <View key={f.id} style={styles.standoutCard}>
            <Text style={styles.standoutSentence}>{f.sentence}</Text>
            <Text style={styles.standoutEvidence}>{f.evidenceLine}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CircadianSection({ patterns }: { patterns: CircadianPattern[] }) {
  if (patterns.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Time of day</Text>
      <View style={styles.sectionList}>
        {patterns.map(p => {
          const formatted = formatCircadianPattern(p);
          return (
            <View key={p.domain} style={styles.smallCard}>
              <Text style={styles.smallCardTitle}>{formatted.domain}</Text>
              <Text style={styles.smallCardBody}>
                Highest {p.highest_block}, lowest {p.lowest_block} · range {formatted.range}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DayOfWeekSection({ patterns }: { patterns: DayOfWeekPattern[] }) {
  if (patterns.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Day of week</Text>
      <View style={styles.sectionList}>
        {patterns.slice(0, 5).map((p, i) => (
          <View key={i} style={styles.smallCard}>
            <Text style={styles.smallCardBody}>{formatDayOfWeekPattern(p)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LagRelationshipSection({ relationships }: { relationships: LagRelationship[] }) {
  if (relationships.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>What tends to follow what</Text>
      <View style={styles.sectionList}>
        {relationships.map((r, i) => (
          <View key={i} style={styles.smallCard}>
            <Text style={styles.smallCardBody}>{formatLagRelationship(r)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Chunk 1–5 of the multi-session Insights port: cluster detection (1),
// circadian detection (2), day-of-week + lag-relationship detection (3),
// the pattern-findings translation layer + "What stands out" ranking (4),
// and pattern evolution detection (5, this pass — mind-only throughout,
// body-day-score merging deferred until body check-ins are ported).
// Deliberately NOT the web app's InsightsScreen.tsx — no RangeControl,
// AreaIndex, PinnedConnections, or area drill-downs, since those need
// findings from detector modules that aren't ported yet (rare events, body
// detectors, domain/sleep correlations, intervention impact).
export default function InsightsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<DetectedCluster[]>([]);
  const [circadianPatterns, setCircadianPatterns] = useState<CircadianPattern[]>([]);
  const [dayOfWeekPatterns, setDayOfWeekPatterns] = useState<DayOfWeekPattern[]>([]);
  const [lagRelationships, setLagRelationships] = useState<LagRelationship[]>([]);
  const [patternEvolutions, setPatternEvolutions] = useState<PatternEvolution[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      await runPatternDetectionIfNeeded(user.id);
    } catch (e) {
      console.error('[InsightsScreen] pattern detection error:', e);
    }

    const to = new Date().toLocaleDateString('en-CA');
    const from30 = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toLocaleDateString('en-CA');
    })();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const from90 = ninetyDaysAgo.toLocaleDateString('en-CA');

    const [clusterData, circadianData, { data: checkIns90d }, { data: sleepLogs90d }, { data: settings }, { data: baselines }] = await Promise.all([
      fetchClustersForDateRange(user.id, from30, to),
      fetchCircadianPatterns(user.id, from30),
      supabase.from('check_ins').select('*').eq('user_id', user.id).eq('status', 'completed').gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: true }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', from90).lte('log_date', to).order('log_date', { ascending: true }),
      supabase.from('check_in_settings').select('active_domains, quick_checkin_domains').eq('user_id', user.id).maybeSingle(),
      supabase.from('baselines').select('*').eq('user_id', user.id).eq('is_current', true),
    ]);

    const sorted = [...clusterData].sort((a, b) => (b.sort_weight ?? 0) - (a.sort_weight ?? 0));
    setClusters(sorted as DetectedCluster[]);
    setCircadianPatterns(circadianData);

    const activeDomains = resolveActiveDomains(settings);
    const days90d = buildDayScores(checkIns90d as CheckIn[] | null, sleepLogs90d as SleepLog[] | null);
    setDayOfWeekPatterns(detectDayOfWeekPatterns(days90d, activeDomains));
    setLagRelationships(detectLagRelationships(days90d, activeDomains));

    const baselineMap: Partial<Record<DomainType, number>> = {};
    (baselines as Baseline[] | null)?.forEach(b => {
      baselineMap[b.domain] = b.baseline_score;
    });
    setPatternEvolutions(detectPatternEvolution(days90d, activeDomains, baselineMap));

    setLoading(false);
  }, [user]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <PulseLoadingScreen />;

  const nothingDetected = clusters.length === 0 && circadianPatterns.length === 0 && dayOfWeekPatterns.length === 0 && lagRelationships.length === 0;

  // Derived, pure, cheap — computed during render rather than stored in its
  // own state/effect. Only findings for detectors ported so far (clusters,
  // day-of-week, lag relationships, pattern evolution); sleep/body/rare-event/
  // intervention findings will join this list as their detectors are ported.
  // Pattern evolution is "What stands out" only, same as the web app — it
  // has no dedicated section of its own (see patternEvolutionFindings' own
  // comment for why).
  const mindFindings = [...clusterFindings(clusters), ...dayOfWeekFindings(dayOfWeekPatterns), ...lagRelationshipFindings(lagRelationships), ...patternEvolutionFindings(patternEvolutions)];
  const standoutFindings = selectStandoutFindings(mindFindings, 3);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={clusters}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Insights</Text>
            <WhatStandsOut findings={standoutFindings} />
            <CircadianSection patterns={circadianPatterns} />
            <DayOfWeekSection patterns={dayOfWeekPatterns} />
            <LagRelationshipSection relationships={lagRelationships} />
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
          nothingDetected ? (
            <View style={styles.empty}>
              <Text style={styles.emptyHeading}>Not enough data yet</Text>
              <Text style={styles.emptyBody}>Patterns appear here once there’s enough check-in history to detect them.</Text>
            </View>
          ) : null
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
  section: { marginBottom: 24 },
  sectionList: { gap: 8 },
  smallCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 16, paddingHorizontal: 20 },
  smallCardTitle: { fontSize: 14, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  smallCardBody: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
  standoutCard: { backgroundColor: '#1a1f3a', borderWidth: 1, borderColor: 'rgba(129,140,248,0.3)', borderRadius: 16, padding: 18, paddingHorizontal: 20 },
  standoutSentence: { fontSize: 15, color: '#e2e8f0', lineHeight: 22, marginBottom: 6 },
  standoutEvidence: { fontSize: 12, color: '#6b7690' },
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 18, paddingHorizontal: 20, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  cardDomains: { fontSize: 15, fontWeight: '500', color: '#e2e8f0' },
  cardRange: { fontSize: 12, color: '#4a5568' },
  cardType: { fontSize: 13, color: '#8892a4', textTransform: 'capitalize' },
  empty: { paddingTop: 60, alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  emptyHeading: { fontSize: 16, fontWeight: '600', color: '#cbd5e0' },
  emptyBody: { fontSize: 13, color: '#4a5568', textAlign: 'center', lineHeight: 19 },
});
