import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { useAuth } from '@/contexts/auth-context';
import { formatShortDate, parseDateString } from '@/lib/date-utils';
import { DOMAIN_COPY, DOMAIN_ORDER, domainHeadingLabel, getDomainColorFromProfile } from '@/lib/domains';
import type { CheckIn, ContextTag, DetectedCluster, DomainType } from '@/lib/supabase';

// Ported from the web app's components/ClusterCard.tsx. Mechanic swap: the
// web version hand-rolls a 500ms touch-hold timer (onTouchStart/End/Move)
// for its "long-press to flag" gesture, since the web platform has no
// native long-press event — RN's Pressable has one built in (onLongPress,
// default ~500ms delay), so that whole timer/ref dance is gone. Also
// dropped: navigator.vibrate haptic feedback on long-press — expo-haptics
// isn't a dependency anywhere else in this app yet, and a single tactile
// nicety isn't worth adding one for.

export interface DayScores {
  date: string;
  scores: Partial<Record<DomainType | 'sleep', number>>;
}

function clusterDescription(cluster: DetectedCluster): string {
  if (cluster.cluster_type === 'baseline_shift') {
    const dir = cluster.direction === 'elevated' ? 'higher' : 'lower';
    const shift = cluster.severity_score;
    return shift != null ? `Your usual level shifted ${dir} by ${shift.toFixed(1)} points` : `Your usual level shifted ${dir}`;
  }
  if (cluster.cluster_type === 'intraday_volatility') {
    const swing = cluster.volatility_score;
    return swing != null ? `Swung ${swing} points` : 'Varied significantly within the day';
  }
  if (cluster.cluster_type === 'rapid_cycling') {
    return 'Shifting between higher and lower than your baseline';
  }
  const domains = cluster.domains_involved ?? [];
  const dir = cluster.direction;
  const dirWord = dir === 'elevated' ? 'higher' : 'lower';
  if (domains.length === 0) return `Several domains ${dirWord} than usual`;
  if (domains.length === 1) return `Consistently ${dirWord} than your baseline`;
  if (domains.length <= 3) return `Both ${dirWord} than usual`;
  return `${dirWord.charAt(0).toUpperCase() + dirWord.slice(1)} than usual`;
}

function clusterDurationLabel(cluster: DetectedCluster): string {
  if (cluster.ongoing) return 'ongoing';
  if (!cluster.end_date) return '1 day';
  const d = Math.round((parseDateString(cluster.end_date).getTime() - parseDateString(cluster.start_date).getTime()) / 86400000) + 1;
  return d === 1 ? '1 day' : `${d} days`;
}

function getClusterDayScores(days: DayScores[], cluster: DetectedCluster): DayScores[] {
  return days.filter(d => d.date >= cluster.start_date && (!cluster.end_date || d.date <= cluster.end_date));
}

interface ClusterDomainStat {
  average: number;
  baseline: number;
  deviation: number;
  trend: 'declining' | 'improving' | 'stable';
  startValue: number;
  endValue: number;
  min: number;
  max: number;
  count: number;
}

function computeDomainStat(domain: DomainType, clusterDays: DayScores[], baseline: number): ClusterDomainStat | null {
  const values = clusterDays.filter(d => d.scores[domain] !== undefined).map(d => d.scores[domain]!);
  if (values.length === 0) return null;
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const deviation = average - baseline;
  const startValue = values[0];
  const endValue = values[values.length - 1];
  const change = endValue - startValue;
  const min = Math.min(...values);
  const max = Math.max(...values);
  let trend: 'declining' | 'improving' | 'stable';
  if (values.length < 2 || Math.abs(change) < 1.5) trend = 'stable';
  else if (deviation < 0) trend = change < 0 ? 'declining' : 'improving';
  else trend = change > 0 ? 'improving' : 'declining';
  return { average, baseline, deviation, trend, startValue, endValue, min, max, count: values.length };
}

const FlagIcon = ({ color, filled }: { color: string; filled: boolean }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={filled ? 0 : 2}>
    <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </Svg>
);

interface Props {
  cluster: DetectedCluster;
  days: DayScores[];
  baselines: Partial<Record<DomainType | 'sleep', number>>;
  contextTags: ContextTag[];
  checkIns?: CheckIn[];
  expanded: boolean;
  onToggle: () => void;
  onViewTimeline: () => void;
  onToggleFlag: () => void;
  timezone?: string | null;
  timeFormat?: '12hr' | '24hr';
}

export function ClusterCard({
  cluster, days, baselines, contextTags, checkIns = [], expanded, onToggle, onViewTimeline, onToggleFlag,
  timezone, timeFormat,
}: Props) {
  const { profile } = useAuth();
  const fmt = formatShortDate;

  const dateRange = cluster.ongoing
    ? `${fmt(cluster.start_date)} → ongoing`
    : cluster.end_date ? `${fmt(cluster.start_date)} - ${fmt(cluster.end_date)}` : fmt(cluster.start_date);

  const duration = clusterDurationLabel(cluster);
  const clusterDays = getClusterDayScores(days, cluster);

  const primaryDomain = cluster.domains_involved[0] as DomainType | undefined;
  const primaryBaseline = primaryDomain ? (baselines[primaryDomain] ?? 5) : 5;
  const primaryStats = primaryDomain ? computeDomainStat(primaryDomain, clusterDays, primaryBaseline) : null;

  let description = clusterDescription(cluster);
  if (cluster.cluster_type === 'sustained_deviation' && primaryStats) {
    const absDev = Math.abs(primaryStats.deviation);
    const dir = primaryStats.deviation < 0 ? 'below' : 'above';
    description = `Averaged ${absDev.toFixed(1)} pts ${dir} baseline`;
  }

  const intradayCheckIns = (cluster.cluster_type === 'intraday_volatility' && primaryDomain)
    ? checkIns
        .filter(ci => ci.scheduled_date === cluster.start_date && ci[primaryDomain] !== null && ci[primaryDomain] !== undefined)
        .sort((a, b) => new Date(a.completed_at || a.scheduled_at).getTime() - new Date(b.completed_at || b.scheduled_at).getTime())
    : [];
  const intradayValues = intradayCheckIns.map(ci => ci[primaryDomain!] as number);
  const intradayMin = intradayValues.length > 0 ? Math.min(...intradayValues) : null;
  const intradayMax = intradayValues.length > 0 ? Math.max(...intradayValues) : null;
  const intradaySwing = intradayMin !== null && intradayMax !== null ? intradayMax - intradayMin : null;

  const coOccurring = DOMAIN_ORDER
    .filter(d => d !== primaryDomain)
    .map(d => {
      const stat = computeDomainStat(d, clusterDays, baselines[d] ?? 5);
      return stat ? { domain: d, ...stat } : null;
    })
    .filter((s): s is ClusterDomainStat & { domain: DomainType } => s !== null && Math.abs(s.deviation) >= 1.5)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  const periodNotes = checkIns
    .filter(ci => {
      if (!ci.notes?.trim()) return false;
      const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
      return date >= cluster.start_date && (!cluster.end_date || date <= cluster.end_date);
    })
    .map(ci => ({
      date: new Date(ci.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      text: ci.notes as string,
    }))
    .slice(0, 3);

  const domainColor = getDomainColorFromProfile(cluster.domains_involved?.[0] ?? '', profile);
  const domainLabels = Object.fromEntries(Object.entries(DOMAIN_COPY).map(([k, v]) => [k, v.label]));
  const headingLabel = domainHeadingLabel(cluster.domains_involved ?? [], domainLabels);

  return (
    <Pressable onPress={onToggle} onLongPress={onToggleFlag} style={[styles.card, { borderLeftColor: domainColor } as ViewStyle]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.heading, { color: domainColor }]}>{headingLabel}</Text>
          {cluster.flagged_for_report && <FlagIcon color="#6366f1" filled />}
        </View>
        <View style={styles.viewPatternRow}>
          <Text style={styles.viewPatternText}>View pattern</Text>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Polygon points="9 18 15 12 9 6" />
          </Svg>
        </View>
      </View>

      <Text style={styles.summary}>
        {dateRange} <Text style={styles.summaryMuted}>({duration})</Text> - {description}
      </Text>

      {cluster.ongoing && (
        <View style={styles.ongoingPill}>
          <Text style={styles.ongoingText}>Ongoing</Text>
        </View>
      )}

      {expanded && (
        <View style={styles.expanded}>
          {cluster.cluster_type !== 'intraday_volatility' && <Text style={styles.expandedDescription}>{description}</Text>}

          {primaryStats && primaryDomain && (
            <View style={styles.primaryStatsBox}>
              <Text style={[styles.primaryStatsLabel, { color: domainColor }]}>{DOMAIN_COPY[primaryDomain]?.label ?? primaryDomain}</Text>
              {cluster.cluster_type === 'intraday_volatility' ? (
                intradayCheckIns.length >= 2 ? (
                  <View>
                    {intradayCheckIns.map((ci, i) => {
                      const val = ci[primaryDomain!] as number;
                      const t = new Date(ci.completed_at || ci.scheduled_at);
                      const timeStr = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: (timeFormat ?? '12hr') === '12hr' });
                      return (
                        <View key={i} style={styles.intradayRow}>
                          <Text style={styles.intradayTime}>{timeStr}</Text>
                          <Text style={styles.intradayValue}>{val}</Text>
                        </View>
                      );
                    })}
                    <Text style={styles.swingLine}>
                      Swing: <Text style={styles.swingValue}>{intradaySwing} point{intradaySwing !== 1 ? 's' : ''}</Text>
                      <Text style={styles.swingMuted}> ({intradayMin} → {intradayMax})</Text>
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.swingLine}>
                    Range: <Text style={styles.swingValue}>{intradayMin ?? primaryStats.min} → {intradayMax ?? primaryStats.max}</Text>
                    <Text style={styles.swingMuted}> ({intradaySwing ?? (primaryStats.max - primaryStats.min).toFixed(1)} point swing)</Text>
                  </Text>
                )
              ) : (
                <>
                  <Text style={styles.averageLine}>
                    Averaged <Text style={styles.averageValue}>{primaryStats.average.toFixed(1)}</Text>
                    <Text style={styles.averageMuted}> (baseline: {primaryStats.baseline})</Text>
                    <Text style={styles.averageMuted}> - {Math.abs(primaryStats.deviation).toFixed(1)} pts {primaryStats.deviation < 0 ? 'lower' : 'higher'}</Text>
                  </Text>
                  {primaryStats.count >= 2 && (
                    <Text style={styles.trendLine}>
                      {primaryStats.trend === 'stable'
                        ? '→ Stable across the period'
                        : primaryStats.trend === 'declining'
                        ? `↓ Declining (${primaryStats.startValue.toFixed(1)} → ${primaryStats.endValue.toFixed(1)})`
                        : `↗ Gradually improving (${primaryStats.startValue.toFixed(1)} → ${primaryStats.endValue.toFixed(1)})`}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {coOccurring.length > 0 ? (
            <View style={styles.coOccurringBox}>
              <Text style={styles.coOccurringLabel}>Also affected during this period:</Text>
              <View style={{ gap: 4 }}>
                {coOccurring.slice(0, 4).map(s => (
                  <Text key={s.domain} style={styles.coOccurringLine}>
                    <Text style={{ color: getDomainColorFromProfile(s.domain, profile), fontWeight: '500' }}>{DOMAIN_COPY[s.domain]?.label ?? s.domain}</Text>
                    {' '}averaged <Text style={styles.coOccurringValue}>{s.average.toFixed(1)}</Text>
                    <Text style={styles.coOccurringMuted}> (baseline: {s.baseline})</Text>
                    {' '}- {Math.abs(s.deviation).toFixed(1)} pts {s.deviation < 0 ? 'lower' : 'higher'}
                  </Text>
                ))}
              </View>
            </View>
          ) : (primaryStats && cluster.cluster_type !== 'intraday_volatility' && cluster.cluster_type !== 'rapid_cycling') && (
            <Text style={styles.isolatedNote}>This pattern was isolated - other tracked symptoms remained near baseline.</Text>
          )}

          {periodNotes.length > 0 && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Your notes:</Text>
              <View style={{ gap: 6 }}>
                {periodNotes.map((note, i) => (
                  <Text key={i} style={styles.noteText}>
                    <Text style={styles.noteDate}>{note.date}:</Text> “{note.text.length > 120 ? note.text.slice(0, 117) + '...' : note.text}”
                  </Text>
                ))}
              </View>
            </View>
          )}

          {cluster.enrichment_completed && contextTags.length > 0 && (
            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>Context:</Text>
              <View style={styles.contextTagsRow}>
                {contextTags.map(t => (
                  <View key={t.id} style={styles.contextTag}>
                    <Text style={styles.contextTagText}>{t.tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {cluster.avg_sleep_during_pattern != null && (
            <View style={styles.sleepBox}>
              <Text style={styles.sleepLabel}>Sleep during this time</Text>
              <Text style={styles.sleepText}>
                Average sleep quality: <Text style={styles.sleepValue}>{Number(cluster.avg_sleep_during_pattern).toFixed(1)}</Text> out of 9
              </Text>
              {cluster.improved_with_sleep && <Text style={styles.sleepNote}>This symptom improved as sleep quality got better</Text>}
              {cluster.high_despite_poor_sleep && <Text style={styles.sleepWarning}>ⓘ Energy stayed high even when sleep quality was low</Text>}
            </View>
          )}

          {cluster.data_points_used != null && (
            <Text style={styles.dataQualityText}>
              Based on {cluster.data_points_used} check-in{cluster.data_points_used !== 1 ? 's' : ''} over this period
              {cluster.data_quality === 'partial' && <Text style={styles.dataQualityWarning}> · Some check-ins were missed during this time</Text>}
              {cluster.data_quality === 'limited' && <Text style={styles.dataQualityWarning}> · Limited data - pattern may be incomplete</Text>}
            </Text>
          )}

          <View style={styles.actionsRow}>
            <Pressable onPress={onViewTimeline} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>View full timeline →</Text>
            </Pressable>
            <Pressable onPress={onToggleFlag} style={styles.actionButton}>
              <View style={styles.flagButtonRow}>
                <FlagIcon color={cluster.flagged_for_report ? '#818cf8' : '#6b7a99'} filled={!!cluster.flagged_for_report} />
                <Text style={[styles.actionButtonText, cluster.flagged_for_report && styles.actionButtonTextActive]}>
                  {cluster.flagged_for_report ? 'Flagged for report' : 'Flag for report'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0f1523', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', borderLeftWidth: 4, borderRadius: 14, padding: 16, paddingHorizontal: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 12, letterSpacing: 0.4, fontWeight: '600' },
  viewPatternRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  viewPatternText: { fontSize: 12, color: '#6b7a99' },
  summary: { fontSize: 14, color: '#b0b8c8', lineHeight: 20 },
  summaryMuted: { color: '#6b7a99', fontSize: 13 },
  ongoingPill: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 20 },
  ongoingText: { fontSize: 11, color: '#f59e0b', fontWeight: '500' },
  expanded: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(99,102,241,0.15)', gap: 0 },
  expandedDescription: { fontSize: 14, color: '#c8d0e0', lineHeight: 21, marginBottom: 14 },
  primaryStatsBox: { backgroundColor: 'rgba(99,102,241,0.06)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)', borderRadius: 10, padding: 12, paddingHorizontal: 14, marginBottom: 12 },
  primaryStatsLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600', marginBottom: 8 },
  intradayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  intradayTime: { fontSize: 13, color: '#8892a4' },
  intradayValue: { fontSize: 13, color: '#e2e8f0', fontWeight: '700' },
  swingLine: { fontSize: 13, color: '#c8d0e0', marginTop: 8 },
  swingValue: { color: '#e2e8f0', fontWeight: '700' },
  swingMuted: { color: '#8892a4' },
  averageLine: { fontSize: 13, color: '#c8d0e0', marginBottom: 4 },
  averageValue: { color: '#e2e8f0', fontWeight: '700' },
  averageMuted: { color: '#8892a4' },
  trendLine: { fontSize: 13, color: '#a0aec0' },
  coOccurringBox: { marginBottom: 12 },
  coOccurringLabel: { fontSize: 12, color: '#8892a4', fontWeight: '600', marginBottom: 7 },
  coOccurringLine: { fontSize: 13, color: '#b0b8c8', lineHeight: 19 },
  coOccurringValue: { color: '#e2e8f0', fontWeight: '700' },
  coOccurringMuted: { color: '#6b7a99' },
  isolatedNote: { fontSize: 13, color: '#6b7a99', fontStyle: 'italic', marginBottom: 12 },
  notesBox: { marginBottom: 12 },
  notesLabel: { fontSize: 12, color: '#8892a4', fontWeight: '600', marginBottom: 7 },
  noteText: { fontSize: 13, color: '#a0aec0', lineHeight: 19 },
  noteDate: { color: '#6b7a99' },
  contextBox: { marginBottom: 12 },
  contextLabel: { fontSize: 12, color: '#8892a4', fontWeight: '600', marginBottom: 7 },
  contextTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  contextTag: { backgroundColor: 'rgba(148,163,184,0.1)', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  contextTagText: { fontSize: 11, color: '#94a3b8' },
  sleepBox: { backgroundColor: 'rgba(99,102,241,0.04)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.1)', borderRadius: 10, padding: 10, paddingHorizontal: 14, marginBottom: 12 },
  sleepLabel: { fontSize: 12, color: '#8892a4', fontWeight: '600', marginBottom: 6 },
  sleepText: { fontSize: 13, color: '#c8d0e0' },
  sleepValue: { color: '#e2e8f0', fontWeight: '700' },
  sleepNote: { fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 17 },
  sleepWarning: { fontSize: 12, color: '#f59e0b', marginTop: 4, lineHeight: 17 },
  dataQualityText: { fontSize: 12, color: '#4a5568', lineHeight: 18, marginBottom: 12 },
  dataQualityWarning: { color: '#92701e' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 6 },
  actionButton: { padding: 0 },
  actionButtonText: { fontSize: 13, color: '#818cf8' },
  actionButtonTextActive: { color: '#818cf8' },
  flagButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
