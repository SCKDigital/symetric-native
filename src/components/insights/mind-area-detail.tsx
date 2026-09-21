import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import BackRow from '@/components/insights/back-row';
import { ClusterCard } from '@/components/insights/cluster-card';
import { DomainSparklineRow } from '@/components/insights/domain-sparkline';
import { useAuth } from '@/contexts/auth-context';
import WhatGoesWithWhatSection from '@/components/insights/correlation-section';
import {
  CollapsibleRow, countRareDayGroups, RareDayGroups,
  WhatComesBeforeWhatSection, WhenItHappensSection,
} from '@/components/insights/pattern-sections';
import type { ConnectionRow } from '@/lib/correlation-groups';
import { clusterDurationDays, factorLabel } from '@/lib/pattern-findings';
import type { CircadianPattern } from '@/lib/circadian-detection';
import type { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { RareEvent } from '@/lib/detection/rare-events';
import { formatShortDate } from '@/lib/date-utils';
import { getDomainColorFromProfile } from '@/lib/domains';
import { aggregateVolatilityGroups, VolatilityGroup } from '@/lib/volatility-aggregation';
import type { CheckIn, ContextTag, DetectedCluster, DomainType } from '@/lib/supabase';
import { brandTint } from '@/constants/brand';
import { makeAccentStyles } from '@/lib/accent-styles';

// Ported from the web app's components/insights/MindAreaDetail.tsx —
// chunk 2 of the 3-chunk MindAreaDetail port (chunk 1: ClusterCard +
// volatility-aggregation.ts). Everything that used to live directly on the
// Insights tab for the 8 mind domains: the pattern list, key
// differentiating patterns, rare days, predictive patterns, first-month-
// vs-this-month, time & day patterns, and tracked symptoms. Reuses existing
// detection outputs and card components; no new detection logic.
//
// onViewCluster/onViewVolatilityGroup are deliberately no-ops this chunk —
// their destination, PatternDetailScreen, is chunk 3. "View full timeline"
// and the volatility-group rows are tappable but go nowhere yet; this
// matches the pattern used throughout this rewrite of shipping a working-
// but-incomplete slice with an explicit, documented gap rather than faking
// navigation that doesn't exist.

export interface DayScores {
  date: string;
  scores: Partial<Record<DomainType | 'sleep', number>>;
}

function patternSummaryLine(cluster: DetectedCluster): string {
  const fmt = formatShortDate;
  const todayStr = new Date().toLocaleDateString('en-CA');
  const n = clusterDurationDays(cluster, todayStr);
  const s = fmt(cluster.start_date);
  const e = cluster.ongoing ? 'now' : cluster.end_date ? fmt(cluster.end_date) : s;
  if (cluster.cluster_type === 'rapid_cycling') {
    return `Alternated elevated and depressed - ${s} to ${e} (${n} day${n !== 1 ? 's' : ''})`;
  }
  const qualifier = cluster.direction === 'elevated' ? 'higher' : 'lower';
  return `Consistently ${qualifier} than baseline - ${s} to ${e} (${n} day${n !== 1 ? 's' : ''})`;
}

function volatilityGroupSummaryLine(group: VolatilityGroup): string {
  const fmt = formatShortDate;
  if (group.dayCount > 1) {
    const rangeStr = group.swingMin === group.swingMax ? `${group.swingMin} points` : `${group.swingMin}-${group.swingMax} points`;
    return `Swung ${rangeStr} on ${group.dayCount} days (${fmt(group.startDate)}-${fmt(group.endDate)})`;
  }
  const swing = group.clusters[0]?.volatility_score;
  return swing != null ? `Swung ${swing} points - ${fmt(group.startDate)}` : `Varied significantly - ${fmt(group.startDate)}`;
}

function DomainCompactRow({ domain, days, baselines, isExpanded, onToggle }: {
  domain: DomainType; days: DayScores[]; baselines: Partial<Record<DomainType | 'sleep', number>>;
  isExpanded: boolean; onToggle: () => void;
}) {
  const { profile } = useAuth();
  const baseline = baselines[domain] ?? 5;
  const values = days
    .filter(d => d.scores[domain] !== undefined)
    .map(d => d.scores[domain]!);

  return (
    <DomainSparklineRow
      label={factorLabel(domain)}
      color={getDomainColorFromProfile(domain, profile)}
      values={values}
      baseline={baseline}
      isExpanded={isExpanded}
      onToggle={onToggle}
    />
  );
}

function HighDespitePoorSleepCard({ cluster, onView }: { cluster: DetectedCluster; onView: () => void }) {
  const styles = useStyles();
  const { profile } = useAuth();
  const fmt = formatShortDate;
  const start = fmt(cluster.start_date);
  const end = cluster.ongoing ? 'now' : cluster.end_date ? fmt(cluster.end_date) : start;
  const domain = cluster.domains_involved?.[0] as DomainType | undefined;
  const domLabel = domain ? factorLabel(domain) : 'Energy';
  const domainColor = getDomainColorFromProfile(domain ?? '', profile);

  return (
    <Pressable onPress={onView} style={[styles.diffCard, { borderColor: `${domainColor}40`, borderLeftColor: domainColor }]}>
      <View style={styles.diffCardContent}>
        <View style={styles.diffCardTagRow}>
          <View style={[styles.diffCardDot, { backgroundColor: domainColor }]} />
          <Text style={[styles.diffCardTag, { color: domainColor }]}>Unusual combination - worth raising specifically</Text>
        </View>
        <Text style={styles.diffCardTitle}>{domLabel} stayed elevated even when sleep was poor</Text>
        <Text style={styles.diffCardDate}>{start}{end !== start ? ` - ${end}` : ''}</Text>
      </View>
      <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <Polyline points="9 18 15 12 9 6" />
      </Svg>
    </Pressable>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  days: DayScores[];
  baselines: Partial<Record<DomainType | 'sleep', number>>;
  clusters: DetectedCluster[];
  contextTags: ContextTag[];
  checkIns: CheckIn[];
  trackedDomains: DomainType[];
  dayOfWeekPatterns: DayOfWeekPattern[];
  lagRelationships: LagRelationship[];
  /** Same-day correlations involving a mind domain, ungrouped. A cross-area
   *  relationship belongs to both screens — that is what it is about. */
  connectionRows: ConnectionRow[];
  rareEvents: RareEvent[];
  circadianPatterns: CircadianPattern[];
  days90dCount: number;
  timeFormat: '12hr' | '24hr';
  onViewCluster: (cluster: DetectedCluster) => void;
  onViewVolatilityGroup: (group: VolatilityGroup) => void;
  onToggleFlag: (clusterId: string) => void;
}

export default function MindAreaDetail({
  onBack, days, baselines, clusters, contextTags, checkIns, trackedDomains,
  dayOfWeekPatterns, lagRelationships, connectionRows, rareEvents, circadianPatterns,
  days90dCount, timeFormat, onViewCluster, onViewVolatilityGroup, onToggleFlag,
}: Props) {
  const styles = useStyles();
  const { profile } = useAuth();
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<DomainType | null>(null);

  const highDespitePoorSleep = clusters.filter(c => c.high_despite_poor_sleep === true).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const volatilityGroups = aggregateVolatilityGroups(clusters);
  const nonVolatility = clusters.filter(c => c.cluster_type !== 'intraday_volatility');

  interface DomainGroup { domain: string; maxSeverity: number; entries: { summaryLine: string; cluster?: DetectedCluster; vg?: VolatilityGroup }[] }
  const groupMap = new Map<string, DomainGroup>();
  const ensure = (d: string) => {
    if (!groupMap.has(d)) groupMap.set(d, { domain: d, maxSeverity: 0, entries: [] });
    return groupMap.get(d)!;
  };
  nonVolatility.forEach(c => {
    const g = ensure(c.domains_involved?.[0] ?? 'mood');
    g.maxSeverity = Math.max(g.maxSeverity, c.severity_score ?? 0);
    g.entries.push({ summaryLine: patternSummaryLine(c), cluster: c });
  });
  volatilityGroups.forEach(vg => {
    const g = ensure(vg.domain);
    g.maxSeverity = Math.max(g.maxSeverity, vg.swingMax);
    g.entries.push({ summaryLine: volatilityGroupSummaryLine(vg), vg });
  });
  const domainGroups = [...groupMap.values()]
    .map(g => ({
      ...g,
      entries: [...g.entries].sort((a, b) =>
        (b.cluster?.start_date ?? '').localeCompare(a.cluster?.start_date ?? '')),
    }))
    .sort((a, b) => b.maxSeverity - a.maxSeverity);
  const visibleGroups = showAllGroups ? domainGroups : domainGroups.slice(0, 3);
  const hiddenCount = domainGroups.length - 3;
  const totalPatternCount = nonVolatility.length + volatilityGroups.length;
  // Everything that belongs under "What's changed", including the parts that
  // are not cluster cards — the section header counts what is behind it.
  const changedCount = totalPatternCount + highDespitePoorSleep.length + countRareDayGroups(rareEvents);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <BackRow label="Mind" onBack={onBack} />

      {changedCount === 0 ? (
        <View>
          <Text style={styles.sectionLabel}>What’s changed</Text>
          <Text style={styles.emptyText}>No standout patterns in this window yet.</Text>
        </View>
      ) : (
        <CollapsibleRow label="What’s changed" defaultOpen meta={`${changedCount}`}>
          <Text style={styles.intro}>Deviations from your personal baseline that lasted several days or kept recurring.</Text>
          <View style={styles.list}>
            {/* Grouped, not flattened. domainGroups was already built here and
                then immediately flatMapped back apart, so its only effect was
                ordering — four overlapping Motivation periods rendered as four
                unlabelled near-identical cards with no indication they were all
                the same domain. The heading is the finding; the cards under it
                are the evidence. */}
            {visibleGroups.map(g => (
              <View key={g.domain} style={styles.domainGroup}>
                <Text style={[styles.domainGroupLabel, { color: getDomainColorFromProfile(g.domain, profile) }]}>
                  {factorLabel(g.domain)}
                  {g.entries.length > 1 ? `  ·  ${g.entries.length} periods` : ''}
                </Text>
                {g.entries.map((entry, i) =>
              entry.cluster ? (
                <ClusterCard
                  key={entry.cluster.id}
                  cluster={entry.cluster}
                  days={days}
                  baselines={baselines}
                  contextTags={contextTags.filter(t => t.cluster_id === entry.cluster!.id)}
                  checkIns={checkIns}
                  expanded={expandedClusterId === entry.cluster.id}
                  onToggle={() => setExpandedClusterId(prev => prev === entry.cluster!.id ? null : entry.cluster!.id)}
                  onViewTimeline={() => onViewCluster(entry.cluster!)}
                  onToggleFlag={() => onToggleFlag(entry.cluster!.id)}
                  timeFormat={timeFormat}
                />
              ) : entry.vg ? (
                <VolatilityGroupCard key={`vol-${i}`} vg={entry.vg} summaryLine={entry.summaryLine} onView={() => onViewVolatilityGroup(entry.vg!)} />
              ) : null
                )}
              </View>
            ))}
            {!showAllGroups && hiddenCount > 0 && (
              <Pressable onPress={() => setShowAllGroups(true)}>
                <Text style={styles.showMoreText}>Show {hiddenCount} more {hiddenCount === 1 ? 'domain' : 'domains'}</Text>
              </Pressable>
            )}
          </View>

          {highDespitePoorSleep.length > 0 && (
            <View style={styles.subBlock}>
              <Text style={styles.subLabel}>Key differentiating patterns</Text>
              <View style={styles.list}>
                {highDespitePoorSleep.map(c => <HighDespitePoorSleepCard key={c.id} cluster={c} onView={() => onViewCluster(c)} />)}
              </View>
            </View>
          )}

          <RareDayGroups events={rareEvents} daysOfData={days90dCount} />
        </CollapsibleRow>
      )}

      <WhatGoesWithWhatSection rows={connectionRows} />
      <WhatComesBeforeWhatSection relationships={lagRelationships} />
      <WhenItHappensSection circadian={circadianPatterns} dayOfWeek={dayOfWeekPatterns} />

      <CollapsibleRow label="Tracked symptoms" defaultOpen>
        {trackedDomains.map(domain => (
          <DomainCompactRow key={domain} domain={domain} days={days} baselines={baselines}
            isExpanded={expandedDomain === domain} onToggle={() => setExpandedDomain(prev => prev === domain ? null : domain)} />
        ))}
      </CollapsibleRow>
    </ScrollView>
  );
}

function VolatilityGroupCard({ vg, summaryLine, onView }: { vg: VolatilityGroup; summaryLine: string; onView: () => void }) {
  const styles = useStyles();
  const { profile } = useAuth();
  const color = getDomainColorFromProfile(vg.domain, profile);
  return (
    <Pressable onPress={onView} style={styles.volCard}>
      <View style={styles.volCardText}>
        <Text style={[styles.volCardDomain, { color }]}>{factorLabel(vg.domain)}</Text>
        <Text style={styles.volCardSummary}>{summaryLine}</Text>
      </View>
      <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <Polyline points="9 18 15 12 9 6" />
      </Svg>
    </Pressable>
  );
}

const useStyles = makeAccentStyles(b => ({
  root: { padding: 20, gap: 28 },
  intro: { fontSize: 12, color: '#4a5568', marginBottom: 12, lineHeight: 18 },
  list: { gap: 10 },
  emptyText: { fontSize: 14, color: '#8892a4', lineHeight: 20 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 12 },
  domainGroup: { gap: 8 },
  subBlock: { gap: 8, marginTop: 4 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#8892a4', letterSpacing: 0.3 },
  domainGroupLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  showMoreText: { fontSize: 13, color: b.fillAlt, paddingVertical: 4 },
  volCard: { backgroundColor: '#0f1523', borderWidth: 1, borderColor: brandTint(b.fillAlt, 0.2), borderLeftWidth: 4, borderRadius: 14, padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  volCardText: { gap: 3 },
  volCardDomain: { fontSize: 12, letterSpacing: 0.4, fontWeight: '600' },
  volCardSummary: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
  diffCard: { backgroundColor: '#141820', borderWidth: 1.5, borderLeftWidth: 6, borderRadius: 14, padding: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  diffCardContent: { flex: 1 },
  diffCardTagRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  diffCardDot: { width: 7, height: 7, borderRadius: 3.5 },
  diffCardTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.35 },
  diffCardTitle: { fontSize: 15, color: '#e2e8f0', fontWeight: '600', marginBottom: 6, lineHeight: 20 },
  diffCardDate: { fontSize: 12, color: '#8892a4' },
  smallCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12, padding: 14, paddingHorizontal: 16, marginBottom: 8 },
  smallCardSentence: { fontSize: 13, color: '#c8d0e0', lineHeight: 19 },
  smallCardBody: { fontSize: 13, color: '#c8d0e0', lineHeight: 19, marginBottom: 5 },
  smallCardMuted: { fontSize: 12, color: '#6b7a99' },
  bold: { fontWeight: '700' },
  rareCard: { backgroundColor: '#141820', borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, paddingHorizontal: 16, marginBottom: 8 },
  rareCardNote: { fontSize: 13, color: '#e2e8f0', lineHeight: 19, marginBottom: 5 },
  rareCardConsequence: { fontSize: 12, color: '#8892a4', marginBottom: 6, lineHeight: 17 },
  rareCardDates: { fontSize: 11, color: '#6b7a99' },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  collapsibleLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', flex: 1 },
  collapsibleMeta: { fontSize: 12, color: '#4a5568' },
  collapsibleBody: { gap: 8, marginTop: 16 },
  collapsibleIntro: { fontSize: 12, color: '#4a5568', marginBottom: 4, lineHeight: 18 },
  collapsibleFooter: { fontSize: 12, color: '#4a5568', marginTop: 4, lineHeight: 18 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  circadianCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 16, paddingHorizontal: 20, marginBottom: 8 },
  circadianHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 },
  circadianDomain: { fontSize: 14, fontWeight: '500', color: '#e2e8f0' },
  circadianRange: { fontSize: 12, color: '#4a5568' },
  circadianGrid: { flexDirection: 'row', gap: 8 },
  circadianBlock: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 10, paddingBottom: 8 },
  circadianBlockName: { fontSize: 11, color: '#6b7a99', marginBottom: 4 },
  circadianBlockValue: { fontSize: 22, fontWeight: '600', color: '#e2e8f0', lineHeight: 24 },
  circadianBlockCount: { fontSize: 11, color: '#3d4b60', marginTop: 4 },
  circadianFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e2533', fontSize: 12, color: '#6b7a99' },
  compactRow: { borderRadius: 12, borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 4, backgroundColor: '#141820', overflow: 'hidden', marginBottom: 8 },
  compactRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 16 },
  compactRowLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, minWidth: 100 },
  compactRowBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, position: 'relative' },
  compactRowFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, opacity: 0.7 },
  compactRowBaselineTick: { position: 'absolute', top: -3, bottom: -3, width: 2, backgroundColor: '#4a5e8a', borderRadius: 1 },
  compactRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  compactRowTrend: { fontSize: 12, color: '#6b7a99' },
  compactRowExpanded: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  compactRowNoData: { fontSize: 12, color: '#4a5568', marginTop: 10, lineHeight: 18 },
}));
