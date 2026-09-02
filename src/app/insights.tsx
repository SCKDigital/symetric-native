import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BodyAreaDetail from '@/components/insights/body-area-detail';
import MedicationAreaDetail from '@/components/insights/medication-area-detail';
import MindAreaDetail from '@/components/insights/mind-area-detail';
import PatternDetailScreen from '@/components/insights/pattern-detail-screen';
import SleepAreaDetail from '@/components/insights/sleep-area-detail';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { AreaRow, buildAreaRows } from '@/lib/area-rows';
import { BODY_DOMAIN_ORDER, BODY_DOMAINS, MORNING_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { CircadianPattern, fetchCircadianPatterns, formatCircadianPattern } from '@/lib/circadian-detection';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { buildDayScores, DayScores, mergeDays } from '@/lib/day-scores';
import { parseDateString } from '@/lib/date-utils';
import { rollingBodyBaseline } from '@/lib/detection/body-baseline';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import { detectBodyEventFrequency, BodyEventFrequencyPattern } from '@/lib/detection/body-event-frequency';
import { detectBodyEventImpacts, BodyEventMindImpact } from '@/lib/detection/body-event-impact';
import { detectBodyTimeOfDayPatterns, MorningEveningPair, BodyTimeOfDayPattern } from '@/lib/detection/body-time-of-day';
import { DayOfWeekPattern, detectDayOfWeekPatterns } from '@/lib/detection/day-of-week-patterns';
import { detectInterventionImpacts, InterventionImpact } from '@/lib/detection/intervention-impact';
import { detectLagRelationships, LagRelationship } from '@/lib/detection/lag-relationships';
import { detectPatternEvolution, MIN_SPAN_DAYS as EVOLUTION_MIN_SPAN_DAYS, PatternEvolution } from '@/lib/detection/pattern-evolution';
import { detectRareEvents, RareEvent } from '@/lib/detection/rare-events';
import { DOMAIN_NAMES, resolveActiveDomains } from '@/lib/domains';
import { runPatternDetectionIfNeeded } from '@/lib/pattern-detection-scheduler';
import {
  Area, BodyMindConnectionRow, PatternFinding,
  bodyEventFrequencyFindings, bodyEventImpactFindings, bodyMindConnectionFindings, bodyTimeOfDayFindings,
  clusterFindings, dayOfWeekFindings, interventionImpactFindings, isBodyDomain, lagRelationshipFindings, patternEvolutionFindings, rareEventFindings,
} from '@/lib/pattern-findings';
import { fetchMarkersInRange } from '@/lib/queries/markers';
import { computeBodySummaries } from '@/lib/report/body-summary';
import type { BodyDomainSummary, BodyEventSummary } from '@/lib/report/types';
import { selectStandoutFindings } from '@/lib/standout-ranking';
import type { VolatilityGroup } from '@/lib/volatility-aggregation';
import { Baseline, BodyDomainType, CheckIn, ContextTag, DetectedCluster, DomainType, SleepLog, supabase } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

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
  // Body domains use BODY_DOMAINS' own label (e.g. "Joint & muscle pain"),
  // not DOMAIN_NAMES — that set is deliberately mind-only wording (see its
  // own header comment), never a dedup target for body domains.
  if (domain in BODY_DOMAINS) return BODY_DOMAINS[domain as BodyDomainType].label;
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

// "The evidence" — one row per tracked area, ported from AreaIndex.tsx. All
// four rows are now tappable (BodyAreaDetail from the body detector sub-
// series; Sleep/Medication/MindAreaDetail from this area-detail series).
function AreaIndex({ rows, onSelect }: { rows: AreaRow[]; onSelect: (area: Area) => void }) {
  if (rows.length === 0) return null;
  const TAPPABLE: Area[] = ['mind', 'body', 'sleep', 'medication'];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>The evidence</Text>
      <View style={styles.sectionList}>
        {rows.map(row => {
          const rowContent = (
            <>
              <View style={styles.areaDot} />
              <View style={styles.areaRowText}>
                <Text style={styles.areaRowLabel}>{row.label}</Text>
                <Text style={styles.areaRowSubtitle}>{row.subtitle}</Text>
              </View>
            </>
          );
          if (TAPPABLE.includes(row.area)) {
            return (
              <Pressable key={row.area} onPress={() => onSelect(row.area)} style={[styles.areaRow, row.state !== 'active' && styles.areaRowMuted]}>
                {rowContent}
              </Pressable>
            );
          }
          return (
            <View key={row.area} style={[styles.areaRow, row.state !== 'active' && styles.areaRowMuted]}>
              {rowContent}
            </View>
          );
        })}
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

function MedicationSection({ impacts }: { impacts: InterventionImpact[] }) {
  if (impacts.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Medication &amp; therapy</Text>
      <View style={styles.sectionList}>
        {impacts.map(impact => {
          const top = impact.affected_domains[0];
          return (
            <View key={impact.marker_id} style={styles.smallCard}>
              <Text style={styles.smallCardTitle}>{impact.marker_label}</Text>
              {top && (
                <Text style={styles.smallCardBody}>
                  {domainLabel(top.domain)} {top.direction} by {Math.abs(top.change).toFixed(1)} points in the {top.window_days} days after
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Chunk 1–8 of the multi-session Insights port: cluster detection (1),
// circadian detection (2), day-of-week + lag-relationship detection (3),
// the pattern-findings translation layer + "What stands out" ranking (4),
// pattern evolution detection (5), rare-event detection (6), a RangeControl/
// AreaIndex UI pass (7), and intervention-impact detection (8). The
// Medication area row is real (markerCount/tooRecentLabel/findings all
// wired, matching the web app's "too early to read" handling for a too-
// recent marker).
//
// Body detector sub-series chunk 6 (final chunk — depends on 1–5) adds real
// body-domain coverage: bodyTimeOfDayFindings/bodyEventFrequencyFindings/
// bodyEventImpactFindings/bodyMindConnectionFindings feed "What stands out"
// and the Body area row, which is now tappable through to BodyAreaDetail.
// Cluster/day-of-week/lag-relationship findings are now split by area
// (`.areas.includes('mind' | 'body')`) rather than assumed mind-only, since
// clusters share one table with body cluster detection (chunk 1) and can
// carry either tag once isBodyDomain stopped being a permanent `false`
// (pattern-findings.ts chunk 4). Pattern evolution and rare-event detection
// also run a second time against body-only day-scores/baselines, reusing
// the same generic detectors mind uses (both were domain-agnostic already —
// widened to TrackedFactor = DomainType | BodyDomainType this chunk).
//
// Mind+body day-score merge pass (later same day): day-of-week-pattern,
// lag-relationship, and intervention-impact detection now run against
// merged mind+body day-scores (mergeDays, defined inside load()) and a
// combined domain list, closing the gap flagged above. day-of-week-
// patterns.ts/lag-relationships.ts/intervention-impact.ts all had their
// TrackedFactor widened to DomainType | BodyDomainType — each was already
// domain-agnostic, so this was a type-level unlock, not new detection
// logic. The raw (non-PatternFinding) DayOfWeekSection/LagRelationshipSection/
// MedicationSection below needed no changes: they already render whatever
// domain a pattern carries via domainLabel() (body-aware since the body
// detector series), so body-domain entries just started appearing once the
// detectors themselves started producing them. Findings composition
// (mindFindings/bodyFindings) needed no changes either — the area-split
// filters added in the body detector series were already forward-looking
// for exactly this moment. Pattern evolution and rare-event detection
// intentionally stay un-merged (separate per-area passes, own baseline
// maps) — merging is only for detectors whose whole point is cross-area
// pairs or a shared per-day domain list.
export default function InsightsScreen() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeDays>(30);
  const [clusters, setClusters] = useState<DetectedCluster[]>([]);
  const [circadianPatterns, setCircadianPatterns] = useState<CircadianPattern[]>([]);
  const [dayOfWeekPatterns, setDayOfWeekPatterns] = useState<DayOfWeekPattern[]>([]);
  const [lagRelationships, setLagRelationships] = useState<LagRelationship[]>([]);
  const [patternEvolutions, setPatternEvolutions] = useState<PatternEvolution[]>([]);
  const [rareEvents, setRareEvents] = useState<RareEvent[]>([]);
  const [interventionImpacts, setInterventionImpacts] = useState<InterventionImpact[]>([]);
  const [markers, setMarkers] = useState<InterventionMarker[]>([]);
  const [tooRecentLabel, setTooRecentLabel] = useState<string | null>(null);
  const [activeDomains, setActiveDomains] = useState<DomainType[]>([]);
  const [rangeStats, setRangeStats] = useState({ from: '', to: '', checkInCount: 0, daysWithCheckIn: 0 });
  const [activeArea, setActiveArea] = useState<Area | null>(null);
  const [bodyDomains, setBodyDomains] = useState<BodyDomainSummary[]>([]);
  const [bodyEvents, setBodyEvents] = useState<BodyEventSummary[]>([]);
  const [bodyDaysLogged, setBodyDaysLogged] = useState(0);
  const [bodyPatternEvolutions, setBodyPatternEvolutions] = useState<PatternEvolution[]>([]);
  const [bodyRareEvents, setBodyRareEvents] = useState<RareEvent[]>([]);
  const [bodyTimeOfDayPatterns, setBodyTimeOfDayPatterns] = useState<BodyTimeOfDayPattern[]>([]);
  const [bodyEventFrequencyPatterns, setBodyEventFrequencyPatterns] = useState<BodyEventFrequencyPattern[]>([]);
  const [bodyEventImpacts, setBodyEventImpacts] = useState<BodyEventMindImpact[]>([]);
  const [bodyMindConnectionRows, setBodyMindConnectionRows] = useState<BodyMindConnectionRow[]>([]);
  const [avgSleepScore, setAvgSleepScore] = useState<number | null>(null);
  const [sleepDaysLogged, setSleepDaysLogged] = useState(0);
  const [days, setDays] = useState<DayScores[]>([]);
  const [days90dCount, setDays90dCount] = useState(0);
  const [contextTags, setContextTags] = useState<ContextTag[]>([]);
  const [rangeCheckInRows, setRangeCheckInRows] = useState<CheckIn[]>([]);
  const [timeFormat, setTimeFormat] = useState<'12hr' | '24hr'>('12hr');
  const [baselineMap, setBaselineMap] = useState<Partial<Record<DomainType, number>>>({});
  const [viewingCluster, setViewingCluster] = useState<DetectedCluster | null>(null);
  const [viewingVolatilityGroup, setViewingVolatilityGroup] = useState<VolatilityGroup | null>(null);

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

    const bodyTrackingEnabled = profile?.body_tracking_enabled ?? false;

    const [
      clusterData, circadianData, { data: checkIns90d }, { data: sleepLogs90d }, { data: settings }, { data: baselines },
      { data: rangeCheckIns }, { data: rangeSleepLogs }, markersData, { data: tagData },
      { data: bodyCheckIns90dRaw }, { data: bodyEvents90dRaw },
      { data: bodyCheckInsRangeRaw }, { data: bodyEventsRangeRaw },
      { data: domainConnectionsData },
    ] = await Promise.all([
      fetchClustersForDateRange(user.id, from30, to),
      fetchCircadianPatterns(user.id, from30),
      supabase.from('check_ins').select('*').eq('user_id', user.id).eq('status', 'completed').gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: true }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', from90).lte('log_date', to).order('log_date', { ascending: true }),
      supabase.from('check_in_settings').select('active_domains, quick_checkin_domains, time_format').eq('user_id', user.id).maybeSingle(),
      supabase.from('baselines').select('*').eq('user_id', user.id).eq('is_current', true),
      supabase.from('check_ins').select('*').eq('user_id', user.id).eq('status', 'completed').gte('scheduled_at', `${fromRange}T00:00:00`).order('scheduled_at', { ascending: true }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', fromRange).lte('log_date', to).order('log_date', { ascending: true }),
      fetchMarkersInRange(from90, to).catch(() => [] as InterventionMarker[]),
      supabase.from('context_tags').select('*').eq('user_id', user.id),
      bodyTrackingEnabled
        ? supabase.from('body_checkins').select('*').eq('user_id', user.id).gte('entry_date', from90).lte('entry_date', to).order('entry_date', { ascending: true })
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      bodyTrackingEnabled
        ? supabase.from('body_events').select('*').eq('user_id', user.id).gte('event_date', from90).lte('event_date', to)
        : Promise.resolve({ data: [] as { event_date: string; event_type: string }[] }),
      bodyTrackingEnabled
        ? supabase.from('body_checkins').select('*').eq('user_id', user.id).gte('entry_date', fromRange).lte('entry_date', to)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      bodyTrackingEnabled
        ? supabase.from('body_events').select('*').eq('user_id', user.id).gte('event_date', fromRange).lte('event_date', to)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      bodyTrackingEnabled
        ? supabase.from('domain_connections').select('*').eq('user_id', user.id).gte('window_end', from90).order('strength', { ascending: false })
        : Promise.resolve({ data: [] as BodyMindConnectionRow[] }),
    ]);

    const sorted = [...clusterData].sort((a, b) => (b.sort_weight ?? 0) - (a.sort_weight ?? 0));
    setClusters(sorted as DetectedCluster[]);
    setCircadianPatterns(circadianData);
    setContextTags(tagData ?? []);
    if (settings?.time_format) setTimeFormat(settings.time_format as '12hr' | '24hr');

    const resolvedDomains = resolveActiveDomains(settings);
    setActiveDomains(resolvedDomains);
    const days90d = buildDayScores(checkIns90d as CheckIn[] | null, sleepLogs90d as SleepLog[] | null);
    setDays90dCount(days90d.length);

    // ── Body day-scores + baseline — computed early so day-of-week/lag-
    // relationship/intervention-impact detection below can merge them in.
    // Filter rather than cast — see body-cluster-detection.ts for why
    // 'exertion' (a legacy value still in body_domains_active's DB default)
    // is excluded.
    const bodyActiveFromProfile: BodyDomainType[] = bodyTrackingEnabled
      ? (((profile?.body_domains_active as string[] | null) ?? [])
          .filter((d): d is BodyDomainType => (BODY_DOMAIN_ORDER as string[]).includes(d)))
      : [];
    const resolvedBodyDomains: BodyDomainType[] = bodyActiveFromProfile.length > 0
      ? bodyActiveFromProfile
      : (bodyTrackingEnabled ? BODY_DOMAIN_ORDER : []);

    function buildBodyDays(rows: Record<string, unknown>[] | null): { date: string; scores: Partial<Record<BodyDomainType, number>> }[] {
      return (rows ?? []).map(entry => {
        const scores: Partial<Record<BodyDomainType, number>> = {};
        for (const d of resolvedBodyDomains) {
          const v = dailyBodyValue(entry, d);
          if (v !== null) scores[d] = v;
        }
        return { date: entry.entry_date as string, scores };
      }).sort((a, b) => a.date.localeCompare(b.date));
    }
    const bodyDays90d = buildBodyDays(bodyCheckIns90dRaw);

    const bodyBaselineMap: Partial<Record<BodyDomainType, number>> = {};
    for (const d of resolvedBodyDomains) {
      const history = bodyDays90d.map(bd => bd.scores[d]).filter((v): v is number => v !== undefined);
      bodyBaselineMap[d] = rollingBodyBaseline(history);
    }

    // Merge mind + body day-scores by date, for detectors whose math is
    // per-domain/per-pair independent (safe to merge without changing
    // mind-only results) and where cross-area pairs are exactly the point:
    // day-of-week patterns, lag relationships, and medication impact.
    // Pattern evolution and rare events stay un-merged — each runs a
    // separate pass per area (own baseline map), same as clusters already
    // do via the shared detected_clusters table.
    const merged90d = mergeDays(days90d, bodyDays90d);
    const combinedDomains = [...resolvedDomains, ...resolvedBodyDomains];

    setDayOfWeekPatterns(detectDayOfWeekPatterns(merged90d, combinedDomains));
    setLagRelationships(detectLagRelationships(merged90d, combinedDomains));

    const baselineMap: Partial<Record<DomainType, number>> = {};
    (baselines as Baseline[] | null)?.forEach(b => {
      baselineMap[b.domain] = b.baseline_score;
    });
    setBaselineMap(baselineMap);
    setPatternEvolutions(detectPatternEvolution(days90d, resolvedDomains, baselineMap));
    setRareEvents(detectRareEvents(days90d, resolvedDomains, baselineMap));
    setBodyPatternEvolutions(detectPatternEvolution(bodyDays90d, resolvedBodyDomains, bodyBaselineMap));
    setBodyRareEvents(detectRareEvents(bodyDays90d, resolvedBodyDomains, bodyBaselineMap));
    setMarkers(markersData);

    // Merged mind+body window, matching the merge rationale above — a
    // medication/therapy marker's before/after effect can land on either
    // side. Window stays 90d, not the selected range — an existing native
    // choice from the mind-only intervention-impact chunk, predating this
    // merge pass and left as-is (out of scope to also change here).
    const impacts = detectInterventionImpacts(markersData, merged90d, combinedDomains);
    setInterventionImpacts(impacts);

    // ── Body: time-of-day (morning vs evening) ───────────────────────────────
    const moPairs: MorningEveningPair[] = [];
    for (const entry of (bodyCheckIns90dRaw ?? []) as Record<string, unknown>[]) {
      for (const d of MORNING_BODY_DOMAIN_ORDER) {
        const evening = entry[d];
        const morning = entry[`morning_${d}`];
        if (typeof evening === 'number' && typeof morning === 'number') {
          moPairs.push({ date: entry.entry_date as string, domain: d, morning, evening });
        }
      }
    }
    setBodyTimeOfDayPatterns(detectBodyTimeOfDayPatterns(moPairs));

    // ── Body: event frequency + body-event → mind impact ─────────────────────
    const bodyEventOccurrences = (bodyEvents90dRaw ?? []) as { event_date: string; event_type: any }[];
    setBodyEventFrequencyPatterns(detectBodyEventFrequency(bodyEventOccurrences, to));
    setBodyEventImpacts(detectBodyEventImpacts(bodyEventOccurrences, days90d, resolvedDomains));

    // ── Body × mind: persisted same-day correlations (chunk 3's weekly
    // scheduler pass writes these; de-duplicate to the highest-strength row
    // per pair, matching the web app's fetchLatestDomainConnections) ────────
    const seenConnectionPairs = new Set<string>();
    const latestConnections: BodyMindConnectionRow[] = [];
    for (const row of (domainConnectionsData ?? []) as BodyMindConnectionRow[]) {
      const key = `${row.domain_a}:${row.domain_b}`;
      if (!seenConnectionPairs.has(key)) {
        seenConnectionPairs.add(key);
        latestConnections.push(row);
      }
    }
    setBodyMindConnectionRows(latestConnections.filter(r => isBodyDomain(r.domain_a) || isBodyDomain(r.domain_b)));

    const bodySummary = computeBodySummaries(bodyCheckInsRangeRaw ?? [], bodyEventsRangeRaw ?? []);
    setBodyDomains(bodySummary.domains);
    setBodyEvents(bodySummary.events);
    setBodyDaysLogged(bodySummary.daysLogged);

    // Ported from the web app's InsightsScreen.tsx: a marker too recent for
    // its impact window to have closed yet reads as "too early to read"
    // rather than silently absent from the medication row. Computed here
    // (not at render time) since it needs Date.now() — impure, and the
    // React Compiler-era lint rules flag that during render even for a
    // one-off "how many days ago" calculation like this.
    const eligibleMarkers = markersData.filter(m => m.marker_type === 'medication' || m.marker_type === 'therapy');
    const impactedMarkerIds = new Set(impacts.map(i => i.marker_id));
    const unreadMarkers = eligibleMarkers.filter(m => !impactedMarkerIds.has(m.id));
    const mostRecentUnread = [...unreadMarkers].sort((a, b) => b.marker_date.localeCompare(a.marker_date))[0];
    const daysSinceMostRecent = mostRecentUnread ? Math.round((Date.now() - parseDateString(mostRecentUnread.marker_date).getTime()) / 86400000) : null;
    setTooRecentLabel(impacts.length === 0 && mostRecentUnread ? `${mostRecentUnread.label} was ${daysSinceMostRecent} day${daysSinceMostRecent !== 1 ? 's' : ''} ago, too early to read` : null);

    const daysRange = buildDayScores(rangeCheckIns as CheckIn[] | null, rangeSleepLogs as SleepLog[] | null);
    setRangeStats({ from: fromRange, to, checkInCount: rangeCheckIns?.length ?? 0, daysWithCheckIn: daysRange.length });
    setDays(daysRange);
    setRangeCheckInRows((rangeCheckIns as CheckIn[] | null) ?? []);

    const sleepDaysList = daysRange.filter(d => d.scores['sleep'] !== undefined);
    setAvgSleepScore(sleepDaysList.length > 0 ? sleepDaysList.reduce((s, d) => s + d.scores['sleep']!, 0) / sleepDaysList.length : null);
    setSleepDaysLogged(sleepDaysList.length);

    setLoading(false);
  }, [user, profile, range]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const toggleFlag = async (clusterId: string) => {
    const cluster = clusters.find(c => c.id === clusterId);
    if (!cluster) return;
    const { error } = await supabase.from('detected_clusters').update({ flagged_for_report: !cluster.flagged_for_report }).eq('id', clusterId);
    if (error) { console.error('[InsightsScreen] toggleFlag:', error); return; }
    setClusters(prev => prev.map(c => c.id === clusterId ? { ...c, flagged_for_report: !c.flagged_for_report } : c));
    setViewingCluster(prev => prev?.id === clusterId ? { ...prev, flagged_for_report: !prev.flagged_for_report } : prev);
  };

  if (loading) return <PulseLoadingScreen />;

  if (viewingCluster) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <PatternDetailScreen
          cluster={viewingCluster}
          baselines={baselineMap}
          contextTags={contextTags.filter(t => t.cluster_id === viewingCluster.id)}
          onBack={() => { setViewingCluster(null); setViewingVolatilityGroup(null); }}
          onToggleFlag={() => toggleFlag(viewingCluster.id)}
          volatilityGroup={viewingVolatilityGroup ?? undefined}
        />
      </SafeAreaView>
    );
  }

  const nothingDetected = clusters.length === 0 && circadianPatterns.length === 0 && dayOfWeekPatterns.length === 0
    && lagRelationships.length === 0 && rareEvents.length === 0 && interventionImpacts.length === 0
    && bodyPatternEvolutions.length === 0 && bodyRareEvents.length === 0 && bodyTimeOfDayPatterns.length === 0
    && bodyEventFrequencyPatterns.length === 0 && bodyEventImpacts.length === 0 && bodyMindConnectionRows.length === 0;

  // Derived, pure, cheap — computed during render rather than stored in its
  // own state/effect. Mirrors the web app's InsightsScreen.tsx mind/sleep
  // split: lag-relationship findings that touch 'sleep' move entirely into
  // sleepFindings (not just mind), everything else stays in mindFindings
  // regardless of any secondary area tag (e.g. a cluster's
  // high_despite_poor_sleep case still counts as mind). Pattern evolution
  // only counts once the selected range covers its own minimum span — same
  // gate the web app applies.
  //
  // clusterFindings/dayOfWeekFindings can each return both mind- and body-
  // tagged findings now (clusters share one table with body cluster
  // detection — body detector sub-series chunk 1) — split by area rather
  // than assuming mind-only, same as the web app's InsightsScreen.tsx.
  const allClusterFindings = clusterFindings(clusters);
  const allDowFindings = dayOfWeekFindings(dayOfWeekPatterns);
  const allLagFindings = lagRelationshipFindings(lagRelationships);
  const mindFindings = [
    ...allClusterFindings.filter(f => f.areas.includes('mind')),
    ...allDowFindings.filter(f => f.areas.includes('mind')),
    ...allLagFindings.filter(f => f.areas.includes('mind') && !f.areas.includes('sleep')),
    ...(range >= EVOLUTION_MIN_SPAN_DAYS ? patternEvolutionFindings(patternEvolutions) : []),
    ...rareEventFindings(rareEvents, 'mind'),
  ];
  const bodyMindConnectionInput = bodyMindConnectionRows.map(r => ({
    domain_a: r.domain_a, domain_b: r.domain_b, moves_together: r.moves_together,
    strength: r.strength, sample_size: r.sample_size, window_end: r.window_end,
  }));
  const bodyFindings: PatternFinding[] = [
    ...allClusterFindings.filter(f => f.areas.includes('body')),
    ...allDowFindings.filter(f => f.areas.includes('body')),
    ...allLagFindings.filter(f => f.areas.includes('body')),
    ...(range >= EVOLUTION_MIN_SPAN_DAYS ? patternEvolutionFindings(bodyPatternEvolutions) : []),
    ...rareEventFindings(bodyRareEvents, 'body'),
    ...bodyTimeOfDayFindings(bodyTimeOfDayPatterns),
    ...bodyEventFrequencyFindings(bodyEventFrequencyPatterns),
    ...bodyEventImpactFindings(bodyEventImpacts),
    ...bodyMindConnectionFindings(bodyMindConnectionInput),
  ];
  const sleepFindings = allLagFindings.filter(f => f.areas.includes('sleep'));
  const medicationFindings = interventionImpactFindings(interventionImpacts);
  const eligibleMarkerCount = markers.filter(m => m.marker_type === 'medication' || m.marker_type === 'therapy').length;

  const standoutFindings = selectStandoutFindings([...mindFindings, ...sleepFindings, ...bodyFindings, ...medicationFindings], 3);
  const areaRows = buildAreaRows({
    mind: { findings: mindFindings, trackedDomainCount: activeDomains.length },
    body: {
      tracked: profile?.body_tracking_enabled ?? false,
      daysLogged: bodyDaysLogged,
      risingCount: bodyFindings.filter(f => f.grade !== 'limited').length,
    },
    sleep: { findings: sleepFindings },
    medication: { markerCount: eligibleMarkerCount, tooRecentLabel, findings: medicationFindings },
  });

  if (activeArea === 'mind') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <MindAreaDetail
          onBack={() => setActiveArea(null)}
          days={days}
          baselines={baselineMap}
          clusters={clusters.filter(c => !isBodyDomain(c.domains_involved?.[0] ?? ''))}
          contextTags={contextTags}
          checkIns={rangeCheckInRows}
          trackedDomains={activeDomains}
          dayOfWeekPatterns={dayOfWeekPatterns}
          lagRelationships={lagRelationships}
          rareEvents={rareEvents}
          circadianPatterns={circadianPatterns}
          days90dCount={days90dCount}
          timeFormat={timeFormat}
          onViewCluster={setViewingCluster}
          onViewVolatilityGroup={group => {
            setViewingVolatilityGroup(group);
            setViewingCluster(group.clusters[group.clusters.length - 1]);
          }}
          onToggleFlag={toggleFlag}
        />
      </SafeAreaView>
    );
  }

  if (activeArea === 'body') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <BodyAreaDetail onBack={() => setActiveArea(null)} domains={bodyDomains} events={bodyEvents} daysLogged={bodyDaysLogged} findings={bodyFindings} />
      </SafeAreaView>
    );
  }

  if (activeArea === 'sleep') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <SleepAreaDetail onBack={() => setActiveArea(null)} findings={sleepFindings} avgSleepScore={avgSleepScore} nightsLogged={sleepDaysLogged} />
      </SafeAreaView>
    );
  }

  if (activeArea === 'medication') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <MedicationAreaDetail onBack={() => setActiveArea(null)} markers={markers} impacts={interventionImpacts} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={clusters}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Insights</Text>
            <RangeControl range={range} onChange={r => { setRange(r); setActiveArea(null); }} fromDate={rangeStats.from} toDate={rangeStats.to} checkInCount={rangeStats.checkInCount} daysWithCheckIn={rangeStats.daysWithCheckIn} />
            <WhatStandsOut findings={standoutFindings} />
            <AreaIndex rows={areaRows} onSelect={setActiveArea} />
            <CircadianSection patterns={circadianPatterns} />
            <DayOfWeekSection patterns={dayOfWeekPatterns} />
            <LagRelationshipSection relationships={lagRelationships} />
            <RareEventsSection events={rareEvents} />
            <MedicationSection impacts={interventionImpacts} />
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
