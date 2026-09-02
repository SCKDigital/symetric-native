import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { formatShortDate, parseDateString } from '@/lib/date-utils';
import { DOMAIN_COPY, DOMAIN_ORDER, domainHeadingLabel, getDomainColorFromProfile } from '@/lib/domains';
import { supabase } from '@/lib/supabase';
import type { ContextTag, DetectedCluster, DomainType } from '@/lib/supabase';
import type { VolatilityGroup } from '@/lib/volatility-aggregation';

// Ported from the web app's components/insights/PatternDetailScreen.tsx —
// chunk 3 (final) of the MindAreaDetail port. Self-contained: fetches its
// own 7-day-buffered check-in window keyed on the cluster's (or, in
// volatility-group mode, the group's) date range, independent of whatever
// data the caller screen already holds. Mechanic swap: the loading state
// uses the app's shared PulseLoadingScreen instead of porting web's bespoke
// 2-bar animated skeleton, matching how every other screen in this app
// handles its own initial load.

interface DayScores {
  date: string;
  scores: Partial<Record<DomainType, number>>;
}

function offsetDate(dateStr: string, days: number): string {
  const d = parseDateString(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

const fmtDate = formatShortDate;

function DomainStatCard({ domain, baselines, avgInCluster }: {
  domain: DomainType; baselines: Partial<Record<DomainType, number>>; avgInCluster: number | null;
}) {
  const { profile } = useAuth();
  const baseline = baselines[domain] ?? 5;
  const deviation = avgInCluster !== null ? avgInCluster - baseline : null;
  const deviationAbs = deviation !== null ? Math.abs(deviation) : null;
  const dir = deviation !== null ? (deviation > 0 ? 'higher' : 'lower') : null;

  return (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <Text style={[styles.statCardDomain, { color: getDomainColorFromProfile(domain, profile) }]}>{DOMAIN_COPY[domain]?.label ?? domain}</Text>
        <Text style={styles.statCardBaseline}>baseline {baseline}</Text>
      </View>
      {deviation !== null && deviationAbs !== null && dir && (
        <Text style={styles.statCardBody}>
          Averaged <Text style={styles.statCardValue}>{avgInCluster!.toFixed(1)}</Text> - {deviationAbs.toFixed(1)} pts {dir} than baseline
        </Text>
      )}
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

interface Props {
  cluster: DetectedCluster;
  baselines: Partial<Record<DomainType, number>>;
  contextTags: ContextTag[];
  onBack: () => void;
  onToggleFlag: () => void;
  from?: 'insights' | 'history';
  volatilityGroup?: VolatilityGroup;
}

export default function PatternDetailScreen({
  cluster, baselines, contextTags, onBack, onToggleFlag, from = 'insights', volatilityGroup,
}: Props) {
  const { user, profile } = useAuth();
  const [days, setDays] = useState<DayScores[]>([]);
  const [dayMinMax, setDayMinMax] = useState<Map<string, Partial<Record<DomainType, { min: number; max: number }>>>>(new Map());
  const [loading, setLoading] = useState(true);

  const clusterEnd = cluster.ongoing ? today() : (cluster.end_date ?? cluster.start_date);
  const effectiveStart = volatilityGroup?.startDate ?? cluster.start_date;
  const effectiveEnd = volatilityGroup?.endDate ?? clusterEnd;
  const displayFrom = offsetDate(effectiveStart, -7);
  const rawDisplayTo = offsetDate(effectiveEnd, cluster.ongoing && !volatilityGroup ? 0 : 7);
  const displayTo = rawDisplayTo > today() ? today() : rawDisplayTo;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Re-fetches whenever the viewed cluster changes — see
    // use-today-check-ins.ts for why this async-fetch-on-mount pattern
    // needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    (async () => {
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('scheduled_at', new Date(displayFrom + 'T00:00:00').toISOString())
        .lte('scheduled_at', new Date(displayTo + 'T23:59:59').toISOString())
        .order('scheduled_at', { ascending: true });

      if (cancelled) return;

      const dayMap = new Map<string, Partial<Record<DomainType, number[]>>>();
      checkIns?.forEach((ci: Record<string, unknown>) => {
        const date = new Date(ci.scheduled_at as string).toLocaleDateString('en-CA');
        if (!dayMap.has(date)) dayMap.set(date, {});
        const entry = dayMap.get(date)!;
        DOMAIN_ORDER.forEach(d => {
          const val = ci[d];
          if (val !== null && val !== undefined) {
            if (!entry[d]) entry[d] = [];
            entry[d]!.push(val as number);
          }
        });
      });

      const processed: DayScores[] = [];
      const processedMinMax = new Map<string, Partial<Record<DomainType, { min: number; max: number }>>>();
      dayMap.forEach((domainArrays, date) => {
        const scores: Partial<Record<DomainType, number>> = {};
        const minMax: Partial<Record<DomainType, { min: number; max: number }>> = {};
        (Object.entries(domainArrays) as [DomainType, number[]][]).forEach(([d, vals]) => {
          scores[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
          minMax[d] = { min: Math.min(...vals), max: Math.max(...vals) };
        });
        processed.push({ date, scores });
        processedMinMax.set(date, minMax);
      });
      processed.sort((a, b) => a.date.localeCompare(b.date));
      setDays(processed);
      setDayMinMax(processedMinMax);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, cluster.id, displayFrom, displayTo]);

  function clusterAvg(domain: DomainType): number | null {
    const clusterDays = days.filter(d => d.date >= effectiveStart && d.date <= effectiveEnd);
    const vals = clusterDays.filter(d => d.scores[domain] !== undefined).map(d => d.scores[domain]!);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const primaryDomain = cluster.domains_involved[0] as DomainType | undefined;

  const volatilityDayBreakdown = volatilityGroup && primaryDomain
    ? [...volatilityGroup.clusters]
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .map(c => {
          const mm = dayMinMax.get(c.start_date)?.[primaryDomain];
          if (!mm || mm.min === mm.max) return null;
          return { date: c.start_date, min: mm.min, max: mm.max, swing: mm.max - mm.min };
        })
        .filter((d): d is { date: string; min: number; max: number; swing: number } => d !== null)
    : [];

  const overallMin = volatilityDayBreakdown.length > 0 ? Math.min(...volatilityDayBreakdown.map(d => d.min)) : null;
  const overallMax = volatilityDayBreakdown.length > 0 ? Math.max(...volatilityDayBreakdown.map(d => d.max)) : null;
  const domainColor = getDomainColorFromProfile(primaryDomain ?? '', profile);
  const domainLabels = Object.fromEntries(Object.entries(DOMAIN_COPY).map(([k, v]) => [k, v.label]));
  const headingLabel = domainHeadingLabel(cluster.domains_involved ?? [], domainLabels);

  const coAffected = DOMAIN_ORDER
    .filter(d => d !== primaryDomain && !cluster.domains_involved.includes(d))
    .map(d => {
      const avg = clusterAvg(d);
      if (avg === null) return null;
      const baseline = baselines[d] ?? 5;
      const dev = avg - baseline;
      return Math.abs(dev) >= 1.5 ? { domain: d, avg, deviation: dev } : null;
    })
    .filter((x): x is { domain: DomainType; avg: number; deviation: number } => x !== null)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  const dateRange = volatilityGroup
    ? `${fmtDate(volatilityGroup.startDate)} - ${fmtDate(volatilityGroup.endDate)}`
    : cluster.ongoing
    ? `${fmtDate(cluster.start_date)} → ongoing`
    : cluster.end_date ? `${fmtDate(cluster.start_date)} - ${fmtDate(cluster.end_date)}` : fmtDate(cluster.start_date);

  const duration = volatilityGroup
    ? `${volatilityGroup.dayCount} volatile day${volatilityGroup.dayCount !== 1 ? 's' : ''}`
    : cluster.ongoing
    ? (() => {
        const d = Math.round((parseDateString(today()).getTime() - parseDateString(cluster.start_date).getTime()) / 86400000) + 1;
        return `${d} day${d !== 1 ? 's' : ''} so far`;
      })()
    : cluster.end_date
    ? (() => {
        const d = Math.round((parseDateString(cluster.end_date!).getTime() - parseDateString(cluster.start_date).getTime()) / 86400000) + 1;
        return `${d} day${d !== 1 ? 's' : ''}`;
      })()
    : '1 day';

  if (loading) return <PulseLoadingScreen />;

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack} style={styles.backRow}>
        <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <Path d="M9 2L4 7l5 5" stroke="#8892a4" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.backText}>Back to {from}</Text>
      </Pressable>

      <View style={styles.headingBlock}>
        <View style={styles.headingTagRow}>
          <Text style={[styles.headingTag, { color: domainColor }]}>{headingLabel}</Text>
        </View>
        <Text style={styles.headingDate}>{dateRange}</Text>
        {overallMin !== null && overallMax !== null && (
          <Text style={styles.swungText}>
            Swung between <Text style={styles.swungValue}>{overallMin}</Text> and <Text style={styles.swungValue}>{overallMax}</Text> across this period
          </Text>
        )}
        <View style={styles.durationRow}>
          <Text style={styles.durationText}>{duration}</Text>
          {cluster.ongoing && !volatilityGroup && (
            <View style={styles.ongoingPill}>
              <Text style={styles.ongoingText}>Ongoing</Text>
            </View>
          )}
        </View>
      </View>

      {cluster.user_notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Your notes</Text>
          <Text style={styles.notesText}>{cluster.user_notes}</Text>
        </View>
      )}

      {contextTags.length > 0 && (
        <View style={styles.contextRow}>
          {contextTags.map(t => (
            <View key={t.id} style={styles.contextTag}>
              <Text style={styles.contextTagText}>{t.tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.sections}>
        {primaryDomain && (
          <View>
            <Text style={styles.sectionLabel}>Primary domain</Text>
            <DomainStatCard domain={primaryDomain} baselines={baselines} avgInCluster={clusterAvg(primaryDomain)} />
          </View>
        )}

        {volatilityDayBreakdown.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>Daily breakdown</Text>
            <View style={styles.breakdownCard}>
              {volatilityDayBreakdown.map((day, i) => (
                <View key={day.date} style={[styles.breakdownRow, i < volatilityDayBreakdown.length - 1 && styles.breakdownRowBorder]}>
                  <Text style={styles.breakdownDate}>{fmtDate(day.date)}</Text>
                  <View style={styles.breakdownValueRow}>
                    <Text style={styles.breakdownRange}>{day.min} - {day.max}</Text>
                    <Text style={styles.breakdownSwing}>({day.swing} pt swing)</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {cluster.domains_involved.length > 1 && (
          <View>
            <Text style={styles.sectionLabel}>Also in this pattern</Text>
            <View style={styles.list}>
              {cluster.domains_involved.slice(1).map(d => (
                <DomainStatCard key={d} domain={d as DomainType} baselines={baselines} avgInCluster={clusterAvg(d as DomainType)} />
              ))}
            </View>
          </View>
        )}

        {coAffected.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>Also affected during this period</Text>
            <View style={styles.list}>
              {coAffected.map(({ domain, avg }) => (
                <DomainStatCard key={domain} domain={domain} baselines={baselines} avgInCluster={avg} />
              ))}
            </View>
          </View>
        )}

        <View>
          <Text style={styles.sectionLabel}>Pattern details</Text>
          <View style={styles.metaCard}>
            {cluster.cluster_type && (
              <MetaRow
                label="Type"
                value={
                  cluster.cluster_type === 'intraday_volatility' ? 'Large swings within a day' :
                  cluster.cluster_type === 'rapid_cycling' ? 'Alternated between high and low' :
                  cluster.cluster_type === 'sustained_deviation' ? 'Stayed away from your usual' :
                  cluster.cluster_type
                }
              />
            )}
            <MetaRow label="Duration" value={duration} />
            {primaryDomain && (() => {
              const avg = clusterAvg(primaryDomain);
              if (avg === null) return null;
              const bl = baselines[primaryDomain] ?? 5;
              const dev = avg - bl;
              const dir = dev >= 0 ? 'above' : 'below';
              return <MetaRow label="Deviation from usual" value={`Averaged ${Math.abs(dev).toFixed(1)} pts ${dir} your usual`} />;
            })()}
            {coAffected.length > 0 && (
              <MetaRow label="Domains also affected" value={coAffected.map(d => DOMAIN_COPY[d.domain]?.label ?? d.domain).join(', ')} />
            )}
          </View>
        </View>

        <Pressable onPress={onToggleFlag} style={[styles.flagButton, cluster.flagged_for_report && styles.flagButtonActive]}>
          <Text style={[styles.flagButtonText, cluster.flagged_for_report && styles.flagButtonTextActive]}>
            {cluster.flagged_for_report ? 'Flagged for report' : 'Flag for report'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12', padding: 20, paddingTop: 20 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: '#8892a4' },
  headingBlock: { marginBottom: 28 },
  headingTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  headingTag: { fontSize: 12, letterSpacing: 0.4, fontWeight: '600' },
  headingDate: { fontSize: 20, fontWeight: '600', color: '#e2e8f0', lineHeight: 27, letterSpacing: -0.4, marginBottom: 8 },
  swungText: { fontSize: 14, color: '#b0b8c8', lineHeight: 21, marginBottom: 8 },
  swungValue: { color: '#e2e8f0', fontWeight: '600' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  durationText: { fontSize: 14, color: '#8892a4' },
  ongoingPill: { paddingVertical: 2, paddingHorizontal: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 20 },
  ongoingText: { fontSize: 11, color: '#f59e0b', fontWeight: '500' },
  notesBox: { backgroundColor: '#0f1523', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', borderRadius: 12, padding: 14, paddingHorizontal: 16, marginBottom: 20 },
  notesLabel: { fontSize: 11, color: '#818cf8', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600', marginBottom: 6 },
  notesText: { fontSize: 14, color: '#c8d0e0', lineHeight: 22 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 24 },
  contextTag: { backgroundColor: 'rgba(148,163,184,0.1)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.15)', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  contextTagText: { fontSize: 12, color: '#94a3b8' },
  sections: { gap: 20 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 12 },
  list: { gap: 14 },
  statCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 18, paddingHorizontal: 20 },
  statCardHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  statCardDomain: { fontSize: 15, fontWeight: '600' },
  statCardBaseline: { fontSize: 11, color: '#6b7a99', fontFamily: 'DM Mono' },
  statCardBody: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
  statCardValue: { color: '#e2e8f0', fontWeight: '500' },
  breakdownCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, overflow: 'hidden' },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 18, gap: 12 },
  breakdownRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  breakdownDate: { fontSize: 13, color: '#8892a4', flexShrink: 0 },
  breakdownValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  breakdownRange: { fontSize: 13, color: '#e2e8f0', fontFamily: 'DM Mono' },
  breakdownSwing: { fontSize: 12, color: '#6b7a99' },
  metaCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 16, paddingHorizontal: 20, gap: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  metaLabel: { fontSize: 13, color: '#6b7a99', flexShrink: 0 },
  metaValue: { fontSize: 13, color: '#c8d0e0', textAlign: 'right', fontFamily: 'DM Mono' },
  flagButton: { padding: 14, paddingHorizontal: 20, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2d3748', borderRadius: 12, alignItems: 'center' },
  flagButtonActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  flagButtonText: { fontSize: 15, fontWeight: '500', color: '#8892a4' },
  flagButtonTextActive: { color: '#ffffff' },
});
