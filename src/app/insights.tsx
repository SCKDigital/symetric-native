import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { AreaRow, buildAreaRows } from '@/lib/area-rows';
import { CircadianPattern, fetchCircadianPatterns, formatCircadianPattern } from '@/lib/circadian-detection';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { buildDayScores } from '@/lib/day-scores';
import { parseDateString } from '@/lib/date-utils';
import { DayOfWeekPattern, detectDayOfWeekPatterns } from '@/lib/detection/day-of-week-patterns';
import { detectLagRelationships, LagRelationship } from '@/lib/detection/lag-relationships';
import { detectPatternEvolution, MIN_SPAN_DAYS as EVOLUTION_MIN_SPAN_DAYS, PatternEvolution } from '@/lib/detection/pattern-evolution';
import { detectRareEvents, RareEvent } from '@/lib/detection/rare-events';
import { DOMAIN_NAMES, resolveActiveDomains } from '@/lib/domains';
import { runPatternDetectionIfNeeded } from '@/lib/pattern-detection-scheduler';
import { clusterFindings, dayOfWeekFindings, lagRelationshipFindings, patternEvolutionFindings, PatternFinding, rareEventFindings } from '@/lib/pattern-findings';
import { selectStandoutFindings } from '@/lib/standout-ranking';
import { Baseline, CheckIn, DetectedCluster, DomainType, SleepLog, supabase } from '@/lib/supabase';

type RangeDays = 7 | 14 | 30 | 60 | 90;
const RANGE_OPTIONS: RangeDays[] = [7, 14, 30, 60, 90];

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

function fmtDate(dateStr: string): string {
  return parseDateString(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// A single dropdown, defaulting to 30 days — ported behavior from the web
// app's RangeControl.tsx. Deliberately no completion percentage anywhere.
function RangeControl({ range, onChange, fromDate, toDate, checkInCount, daysWithCheckIn }: { range: RangeDays; onChange: (r: RangeDays) => void; fromDate: string; toDate: string; checkInCount: number; daysWithCheckIn: number }) {
  return (
    <View style={styles.rangeControl}>
      <View style={styles.rangePillRow}>
        {RANGE_OPTIONS.map(r => (
          <Pressable key={r} onPress={() => onChange(r)} style={[styles.rangePill, r === range && styles.rangePillActive]}>
            <Text style={[styles.rangePillText, r === range && styles.rangePillTextActive]}>{r}d</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.rangeStats}>
        {fmtDate(fromDate)} to {fmtDate(toDate)} · {checkInCount} check-in{checkInCount !== 1 ? 's' : ''} · {daysWithCheckIn} day{daysWithCheckIn !== 1 ? 's' : ''} with a check-in
      </Text>
    </View>
  );
}

// "The evidence" — one row per tracked area, ported from AreaIndex.tsx. The
// web version is tappable (opens a per-area detail view with sparklines/
// correlations/rare-day content); those detail screens aren't ported yet, so
// this is informational-only for now rather than pretending to navigate
// somewhere real.
function AreaIndex({ rows }: { rows: AreaRow[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>The evidence</Text>
      <View style={styles.sectionList}>
        {rows.map(row => (
          <View key={row.area} style={[styles.areaRow, row.state !== 'active' && styles.areaRowMuted]}>
            <View style={styles.areaDot} />
            <View style={styles.areaRowText}>
              <Text style={styles.areaRowLabel}>{row.label}</Text>
              <Text style={styles.areaRowSubtitle}>{row.subtitle}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
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

function RareEventsSection({ events }: { events: RareEvent[] }) {
  if (events.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Rare days</Text>
      <View style={styles.sectionList}>
        {events.map((e, i) => (
          <View key={i} style={styles.smallCard}>
            <Text style={styles.smallCardBody}>{e.clinical_note}</Text>
            {e.consequence_pattern && <Text style={[styles.smallCardBody, styles.smallCardSubtext]}>{e.consequence_pattern}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

// Chunk 1–7 of the multi-session Insights port: cluster detection (1),
// circadian detection (2), day-of-week + lag-relationship detection (3),
// the pattern-findings translation layer + "What stands out" ranking (4),
// pattern evolution detection (5), rare-event detection (6), and this pass
// (7) — a UI pass rather than another detector: a real RangeControl and
// AreaIndex ("The evidence") built on top of the six detectors above,
// including the mind/sleep finding partition the web app actually does
// (lag-relationship findings that touch sleep move entirely into the sleep
// bucket, not just mind) which earlier chunks hadn't replicated yet.
// Mind-only throughout — body-day-score merging and intervention markers
// (needed for the Body/Medication rows) are still deferred. Area rows are
// informational-only for now (no tap-through) since the per-area detail
// screens (MindAreaDetail etc.) aren't ported.
export default function InsightsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeDays>(30);
  const [clusters, setClusters] = useState<DetectedCluster[]>([]);
  const [circadianPatterns, setCircadianPatterns] = useState<CircadianPattern[]>([]);
  const [dayOfWeekPatterns, setDayOfWeekPatterns] = useState<DayOfWeekPattern[]>([]);
  const [lagRelationships, setLagRelationships] = useState<LagRelationship[]>([]);
  const [patternEvolutions, setPatternEvolutions] = useState<PatternEvolution[]>([]);
  const [rareEvents, setRareEvents] = useState<RareEvent[]>([]);
  const [activeDomains, setActiveDomains] = useState<DomainType[]>([]);
  const [rangeStats, setRangeStats] = useState({ from: '', to: '', checkInCount: 0, daysWithCheckIn: 0 });

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
    const fromRange = (() => {
      const d = new Date();
      d.setDate(d.getDate() - range + 1);
      return d.toLocaleDateString('en-CA');
    })();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const from90 = ninetyDaysAgo.toLocaleDateString('en-CA');

    const [clusterData, circadianData, { data: checkIns90d }, { data: sleepLogs90d }, { data: settings }, { data: baselines }, { data: rangeCheckIns }, { data: rangeSleepLogs }] = await Promise.all([
      fetchClustersForDateRange(user.id, from30, to),
      fetchCircadianPatterns(user.id, from30),
      supabase.from('check_ins').select('*').eq('user_id', user.id).eq('status', 'completed').gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: true }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', from90).lte('log_date', to).order('log_date', { ascending: true }),
      supabase.from('check_in_settings').select('active_domains, quick_checkin_domains').eq('user_id', user.id).maybeSingle(),
      supabase.from('baselines').select('*').eq('user_id', user.id).eq('is_current', true),
      supabase.from('check_ins').select('*').eq('user_id', user.id).eq('status', 'completed').gte('scheduled_at', `${fromRange}T00:00:00`).order('scheduled_at', { ascending: true }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', fromRange).lte('log_date', to).order('log_date', { ascending: true }),
    ]);

    const sorted = [...clusterData].sort((a, b) => (b.sort_weight ?? 0) - (a.sort_weight ?? 0));
    setClusters(sorted as DetectedCluster[]);
    setCircadianPatterns(circadianData);

    const resolvedDomains = resolveActiveDomains(settings);
    setActiveDomains(resolvedDomains);
    const days90d = buildDayScores(checkIns90d as CheckIn[] | null, sleepLogs90d as SleepLog[] | null);
    setDayOfWeekPatterns(detectDayOfWeekPatterns(days90d, resolvedDomains));
    setLagRelationships(detectLagRelationships(days90d, resolvedDomains));

    const baselineMap: Partial<Record<DomainType, number>> = {};
    (baselines as Baseline[] | null)?.forEach(b => {
      baselineMap[b.domain] = b.baseline_score;
    });
    setPatternEvolutions(detectPatternEvolution(days90d, resolvedDomains, baselineMap));
    setRareEvents(detectRareEvents(days90d, resolvedDomains, baselineMap));

    const daysRange = buildDayScores(rangeCheckIns as CheckIn[] | null, rangeSleepLogs as SleepLog[] | null);
    setRangeStats({ from: fromRange, to, checkInCount: rangeCheckIns?.length ?? 0, daysWithCheckIn: daysRange.length });

    setLoading(false);
  }, [user, range]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <PulseLoadingScreen />;

  const nothingDetected = clusters.length === 0 && circadianPatterns.length === 0 && dayOfWeekPatterns.length === 0 && lagRelationships.length === 0 && rareEvents.length === 0;

  // Derived, pure, cheap — computed during render rather than stored in its
  // own state/effect. Mirrors the web app's InsightsScreen.tsx mind/sleep
  // split: lag-relationship findings that touch 'sleep' move entirely into
  // sleepFindings (not just mind), everything else stays in mindFindings
  // regardless of any secondary area tag (e.g. a cluster's
  // high_despite_poor_sleep case still counts as mind). Pattern evolution
  // only counts once the selected range covers its own minimum span — same
  // gate the web app applies.
  const allLagFindings = lagRelationshipFindings(lagRelationships);
  const mindFindings = [
    ...clusterFindings(clusters),
    ...dayOfWeekFindings(dayOfWeekPatterns),
    ...allLagFindings.filter(f => f.areas.includes('mind') && !f.areas.includes('sleep')),
    ...(range >= EVOLUTION_MIN_SPAN_DAYS ? patternEvolutionFindings(patternEvolutions) : []),
    ...rareEventFindings(rareEvents, 'mind'),
  ];
  const sleepFindings = allLagFindings.filter(f => f.areas.includes('sleep'));
  const standoutFindings = selectStandoutFindings([...mindFindings, ...sleepFindings], 3);
  const areaRows = buildAreaRows({
    mind: { findings: mindFindings, trackedDomainCount: activeDomains.length },
    body: { tracked: false, daysLogged: 0, risingCount: 0 },
    sleep: { findings: sleepFindings },
    medication: { markerCount: 0, tooRecentLabel: null, findings: [] },
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={clusters}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Insights</Text>
            <RangeControl range={range} onChange={setRange} fromDate={rangeStats.from} toDate={rangeStats.to} checkInCount={rangeStats.checkInCount} daysWithCheckIn={rangeStats.daysWithCheckIn} />
            <WhatStandsOut findings={standoutFindings} />
            <AreaIndex rows={areaRows} />
            <CircadianSection patterns={circadianPatterns} />
            <DayOfWeekSection patterns={dayOfWeekPatterns} />
            <LagRelationshipSection relationships={lagRelationships} />
            <RareEventsSection events={rareEvents} />
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
  rangeControl: { marginBottom: 24 },
  rangePillRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  rangePill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533' },
  rangePillActive: { backgroundColor: 'rgba(129,140,248,0.15)', borderColor: 'rgba(129,140,248,0.4)' },
  rangePillText: { fontSize: 13, fontWeight: '500', color: '#8892a4' },
  rangePillTextActive: { color: '#e2e8f0' },
  rangeStats: { fontSize: 12, color: '#6b7a99' },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 14, paddingHorizontal: 16 },
  areaRowMuted: { opacity: 0.7 },
  areaDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#818cf8', flexShrink: 0 },
  areaRowText: { flex: 1 },
  areaRowLabel: { fontSize: 14, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  areaRowSubtitle: { fontSize: 12, color: '#8892a4' },
  smallCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 16, paddingHorizontal: 20 },
  smallCardTitle: { fontSize: 14, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  smallCardBody: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
  smallCardSubtext: { marginTop: 4, color: '#6b7690', fontStyle: 'italic' },
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
