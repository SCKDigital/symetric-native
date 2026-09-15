import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useAuth } from '@/contexts/auth-context';
import { CircadianPattern, formatCircadianPattern } from '@/lib/circadian-detection';
import { formatShortDate } from '@/lib/date-utils';
import type { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { RareEvent } from '@/lib/detection/rare-events';
import { getDomainColorFromProfile } from '@/lib/domains';
import { factorLabel } from '@/lib/pattern-findings';
import type { DetectedCluster } from '@/lib/supabase';

/**
 * The pattern sections shared by the Mind and Body drill-downs.
 *
 * These lived only inside mind-area-detail.tsx, which meant body-domain
 * findings had nowhere to go: the Body screen had no equivalent sections, so
 * the only place they appeared was a flat list at the bottom of the Insights
 * index — where they sat alongside the *same* mind findings, unscoped. Every
 * finding was therefore on screen two or three times (once in "What stands
 * out", once in that flat list, once in a drill-down) while body findings had
 * no home of their own at all.
 *
 * One implementation, used by both screens, because a second copy is precisely
 * how the Mind screen came to render body domains through a mind-only label
 * map in the first place.
 *
 * Each section owns its open/closed state and renders nothing when it has no
 * content, so a caller can drop all three in and let them decide.
 */

export function CollapsibleRow({ label, meta, defaultOpen = false, children }: {
  label: string;
  meta?: string;
  /** Open on mount. Use for the section a screen is primarily *about*. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <View>
      <Pressable
        onPress={() => setExpanded(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.collapsibleHeader}>
        <Text style={styles.collapsibleLabel}>{label}</Text>
        {meta ? <Text style={styles.collapsibleMeta}>{meta}</Text> : null}
        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" style={expanded ? styles.chevronExpanded : undefined}>
          <Polyline points="6 9 12 15 18 9" />
        </Svg>
      </Pressable>
      {expanded && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

function LagRelationshipCard({ rel }: { rel: LagRelationship }) {
  const { profile } = useAuth();
  const lagStr = rel.lagDays === 1 ? 'the next day' : 'two days later';
  const instanceNote = `detected in ${rel.instanceCount} of ${rel.totalPairs} instances`;
  const predColor = getDomainColorFromProfile(rel.predictor, profile);
  const outColor = getDomainColorFromProfile(rel.outcome, profile);
  const predDisplay = rel.predictor === 'sleep' ? 'sleep quality' : factorLabel(rel.predictor);
  const outDisplay = factorLabel(rel.outcome);

  let sentence: React.ReactNode;
  if (rel.predictor === 'sleep') {
    sentence = rel.direction === 'positive'
      ? <>Better sleep tends to be followed by higher <Text style={{ color: outColor }}>{outDisplay}</Text> {lagStr}</>
      : <>Lower <Text style={{ color: predColor }}>{predDisplay}</Text> tends to be followed by higher <Text style={{ color: outColor }}>{outDisplay}</Text> {lagStr}</>;
  } else if (rel.direction === 'positive') {
    sentence = <>When <Text style={{ color: predColor }}>{predDisplay}</Text> is <Text style={styles.bold}>elevated</Text>, <Text style={{ color: outColor }}>{outDisplay}</Text> tends to be <Text style={styles.bold}>elevated</Text> {lagStr}</>;
  } else {
    sentence = <>When <Text style={{ color: predColor }}>{predDisplay}</Text> is <Text style={styles.bold}>elevated</Text>, <Text style={{ color: outColor }}>{outDisplay}</Text> tends to <Text style={styles.bold}>drop</Text> {lagStr}</>;
  }

  return (
    <View style={styles.smallCard}>
      <Text style={styles.smallCardSentence}>{sentence} <Text style={styles.smallCardMuted}>({instanceNote})</Text></Text>
    </View>
  );
}

function DayOfWeekPatternCard({ pat }: { pat: DayOfWeekPattern }) {
  const domLabel = factorLabel(pat.domain);
  const diffStr = pat.difference.toFixed(1);
  const hl = pat.direction === 'elevated' ? 'higher' : 'lower';
  const primaryText = pat.type === 'weekday_weekend'
    ? `${domLabel} is ${diffStr} points ${hl} on ${pat.direction === 'elevated' ? 'weekends' : 'weekdays'} than ${pat.direction === 'elevated' ? 'weekdays' : 'weekends'}`
    : `${domLabel} is ${diffStr} points ${hl} on ${pat.dayName}s than your weekly average`;

  return (
    <View style={styles.smallCard}>
      <Text style={styles.smallCardBody}>{primaryText}</Text>
      <Text style={styles.smallCardMuted}>observed in {pat.consistentWeeks} of {pat.weekCount} weeks</Text>
    </View>
  );
}

// ── Rare days, grouped by domain ────────────────────────────────────────────
//
// This used to be one card per detected thing, so a domain that swung on four
// separate days produced four near-identical cards and the section read as a
// list of dates rather than a list of findings. Grouping by domain answers the
// question the section is actually for — "what is unusual about *this* domain"
// — and pushes the dates into an expandable detail.
//
// Events that are inherently about several domains at once (all elevated, all
// suppressed, a multi-domain crash) have no single owner and go into their own
// group at the end rather than being duplicated into every domain.

const CROSS_DOMAIN = '__cross__';

interface RareDayOccurrence {
  /** Already-formatted date or date range. */
  when: string;
  note?: string;
}

interface RareDayEntry {
  key: string;
  /** Lowercase noun phrase — reads as "volatility recorded on 4 days". */
  kind: string;
  count: number;
  /** Volatility and spikes are counted in days; runs of poor sleep in times. */
  unit: 'days' | 'times';
  occurrences: RareDayOccurrence[];
}

interface RareDayGroup {
  domain: string;
  label: string;
  entries: RareDayEntry[];
  total: number;
}

function formatRange(cluster: DetectedCluster): string {
  const start = formatShortDate(cluster.start_date);
  if (!cluster.end_date) return `${start} · ongoing`;
  if (cluster.end_date === cluster.start_date) return start;
  return `${start} – ${formatShortDate(cluster.end_date)}`;
}

/** Inclusive day span of a cluster; an ongoing one counts as its start day. */
function clusterDayCount(c: DetectedCluster): number {
  if (!c.end_date || c.end_date === c.start_date) return 1;
  const ms = new Date(c.end_date + 'T12:00:00').getTime() - new Date(c.start_date + 'T12:00:00').getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function buildRareDayGroups(events: RareEvent[], volatilityClusters: DetectedCluster[]): RareDayGroup[] {
  const byDomain = new Map<string, RareDayEntry[]>();
  const push = (domain: string, entry: RareDayEntry) => {
    const list = byDomain.get(domain);
    if (list) list.push(entry);
    else byDomain.set(domain, [entry]);
  };

  // Volatility: all of a domain's clusters collapse into a single entry, so
  // four separate swings read as "volatility recorded on 4 days".
  const volatilityByDomain = new Map<string, DetectedCluster[]>();
  volatilityClusters.forEach(c => {
    const domain = (c.domains_involved ?? [])[0] ?? CROSS_DOMAIN;
    const list = volatilityByDomain.get(domain);
    if (list) list.push(c);
    else volatilityByDomain.set(domain, [c]);
  });
  volatilityByDomain.forEach((clusters, domain) => {
    push(domain, {
      key: `volatility:${domain}`,
      kind: 'volatility',
      count: clusters.reduce((sum, c) => sum + clusterDayCount(c), 0),
      unit: 'days',
      occurrences: clusters
        .slice()
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .map(c => ({ when: formatRange(c), note: 'Swung more than usual within the day' })),
    });
  });

  events.forEach((e, i) => {
    const dates = e.occurrence_dates.slice().sort((a, b) => b.localeCompare(a));
    const occurrences: RareDayOccurrence[] = dates.map(d => ({ when: formatShortDate(d) }));
    // consequence_pattern is one statement about the event as a whole, not
    // about any single occurrence, so it rides on the first row.
    if (e.consequence_pattern && occurrences.length > 0) occurrences[0].note = e.consequence_pattern;

    if (e.event_type === 'consecutive_poor_sleep') {
      push('sleep', {
        key: `sleep-run:${i}`,
        kind: 'three or more poor nights in a row',
        count: e.frequency,
        unit: 'times',
        occurrences: occurrences.map(o => ({ ...o, note: o.note ?? 'Run started this day' })),
      });
      return;
    }

    if (e.event_type === 'extreme_spike') {
      const domain = e.affected_domains[0] ?? CROSS_DOMAIN;
      push(domain, {
        key: `spike:${domain}:${i}`,
        kind: 'a reading three or more points from your baseline',
        count: e.frequency,
        unit: 'days',
        occurrences,
      });
      return;
    }

    const kind =
      e.event_type === 'all_elevated' ? 'every tracked domain elevated at once'
      : e.event_type === 'all_suppressed' ? 'every tracked domain suppressed at once'
      : 'three or more domains dropping within 48 hours';
    push(CROSS_DOMAIN, { key: `${e.event_type}:${i}`, kind, count: e.frequency, unit: 'days', occurrences });
  });

  const groups: RareDayGroup[] = [];
  byDomain.forEach((entries, domain) => {
    groups.push({
      domain,
      label: domain === CROSS_DOMAIN ? 'Across your domains' : factorLabel(domain),
      entries,
      total: entries.reduce((sum, e) => sum + e.count, 0),
    });
  });

  // Busiest domain first; the cross-domain group is not about any one domain,
  // so it sits at the end regardless of size.
  return groups.sort((a, b) => {
    if (a.domain === CROSS_DOMAIN) return 1;
    if (b.domain === CROSS_DOMAIN) return -1;
    return b.total - a.total || a.label.localeCompare(b.label);
  });
}

/** "Volatility recorded on 4 days" / "Three or more poor nights in a row recorded 2 times". */
function describeRareDayEntry(e: RareDayEntry): string {
  const noun = e.unit === 'days'
    ? `on ${e.count} day${e.count === 1 ? '' : 's'}`
    : `${e.count} time${e.count === 1 ? '' : 's'}`;
  const sentence = `${e.kind} recorded ${noun}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function RareDayGroupCard({ group }: { group: RareDayGroup }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const color = group.domain === CROSS_DOMAIN ? '#8892a4' : getDomainColorFromProfile(group.domain, profile);

  return (
    <View style={styles.smallCard}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.rareGroupHeader, pressed && styles.pressed]}>
        <View style={styles.rareGroupHeading}>
          <Text style={[styles.smallCardTitle, { color }]}>{group.label}</Text>
          {group.entries.map(e => (
            <Text key={e.key} style={styles.smallCardBody}>{describeRareDayEntry(e)}</Text>
          ))}
        </View>
        <Text style={styles.collapsibleChevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>

      {open && (
        <View style={styles.rareGroupDetail}>
          {group.entries.map(e => (
            <View key={e.key} style={styles.rareEntryDetail}>
              {group.entries.length > 1 && (
                <Text style={[styles.smallCardBody, styles.rareEntryKind]}>{e.kind}</Text>
              )}
              {e.occurrences.map((o, i) => (
                <View key={`${e.key}:${i}`} style={styles.rareOccurrence}>
                  <View style={[styles.rareOccurrenceDot, { backgroundColor: color }]} />
                  <View style={styles.rareOccurrenceText}>
                    <Text style={styles.smallCardBody}>{o.when}</Text>
                    {o.note && <Text style={[styles.smallCardBody, styles.smallCardSubtext]}>{o.note}</Text>}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function RareDaysSection({ events, volatilityClusters = [], daysOfData }: {
  events: RareEvent[];
  /** Intraday swings. Grouped in here rather than listed under Patterns —
   *  a one-day swing is a rare day, not a pattern that persisted. */
  volatilityClusters?: DetectedCluster[];
  daysOfData: number;
}) {
  const groups = useMemo(
    () => buildRareDayGroups(events, volatilityClusters),
    [events, volatilityClusters],
  );
  if (groups.length === 0) return null;
  return (
    <CollapsibleRow label="Rare days" meta={`${groups.length} domain${groups.length !== 1 ? 's' : ''}`}>
      <Text style={styles.collapsibleIntro}>Days that looked statistically different from your typical pattern.</Text>
      {groups.map(g => <RareDayGroupCard key={g.domain} group={g} />)}
      <Text style={styles.collapsibleFooter}>Based on {daysOfData} days of data.</Text>
    </CollapsibleRow>
  );
}

export function PredictivePatternsSection({ relationships }: { relationships: LagRelationship[] }) {
  if (relationships.length === 0) return null;
  return (
    <CollapsibleRow
      label="What tends to follow what"
      meta={`${relationships.length} relationship${relationships.length !== 1 ? 's' : ''}`}>
      {[...relationships].sort((a, b) => b.instanceCount - a.instanceCount).map(rel => (
        <LagRelationshipCard key={`${rel.predictor}-${rel.outcome}-${rel.lagDays}`} rel={rel} />
      ))}
    </CollapsibleRow>
  );
}

export function TimeAndDaySection({ circadian, dayOfWeek }: {
  circadian: CircadianPattern[];
  dayOfWeek: DayOfWeekPattern[];
}) {
  // A sub-2-point swing across the day is noise dressed as a finding.
  const meaningful = circadian.filter(p => p.range >= 2.0);
  if (meaningful.length === 0 && dayOfWeek.length === 0) return null;

  return (
    <CollapsibleRow
      label="Time &amp; day patterns"
      meta={[
        meaningful.length > 0 && `${meaningful.length} time-of-day`,
        dayOfWeek.length > 0 && `${dayOfWeek.length} day-of-week`,
      ].filter(Boolean).join(' · ')}>
      {dayOfWeek.map((pat, i) => <DayOfWeekPatternCard key={`${pat.domain}-${pat.type}-${i}`} pat={pat} />)}
      {meaningful.map(pattern => {
        const formatted = formatCircadianPattern(pattern);
        return (
          <View key={pattern.domain} style={styles.circadianCard}>
            <View style={styles.circadianHeader}>
              <Text style={styles.circadianDomain}>{formatted.domain}</Text>
              <Text style={styles.circadianRange}>{formatted.range.toFixed(1)} pt range</Text>
            </View>
            <View style={styles.circadianGrid}>
              {(['Morning', 'Midday', 'Afternoon', 'Evening'] as const).map(blockName => {
                const block = formatted.blocks.find(b => b.name === blockName);
                return (
                  <View key={blockName} style={styles.circadianBlock}>
                    <Text style={styles.circadianBlockName}>{blockName}</Text>
                    <Text style={styles.circadianBlockValue}>{block ? block.avg.toFixed(1) : '-'}</Text>
                    <Text style={styles.circadianBlockCount}>{block ? `${block.count} log${block.count !== 1 ? 's' : ''}` : 'no data'}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.circadianFooter}>Higher in the {pattern.highest_block}, lower in the {pattern.lowest_block}</Text>
          </View>
        );
      })}
    </CollapsibleRow>
  );
}

const styles = StyleSheet.create({
  smallCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12, padding: 14, paddingHorizontal: 16, marginBottom: 8 },
  smallCardSentence: { fontSize: 13, color: '#c8d0e0', lineHeight: 19 },
  smallCardBody: { fontSize: 13, color: '#c8d0e0', lineHeight: 19, marginBottom: 5 },
  smallCardMuted: { fontSize: 12, color: '#6b7a99' },
  smallCardSubtext: { marginTop: 4, color: '#6b7690', fontStyle: 'italic' },
  bold: { fontWeight: '700' },
  rareCard: { backgroundColor: '#141820', borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, paddingHorizontal: 16, marginBottom: 8 },
  rareCardNote: { fontSize: 13, color: '#e2e8f0', lineHeight: 19, marginBottom: 5 },
  rareCardConsequence: { fontSize: 12, color: '#8892a4', marginBottom: 6, lineHeight: 17 },
  rareCardDates: { fontSize: 11, color: '#6b7a99' },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsibleLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', flex: 1 },
  collapsibleMeta: { fontSize: 12, color: '#4a5568' },
  collapsibleBody: { gap: 8, marginTop: 16 },
  collapsibleIntro: { fontSize: 12, color: '#4a5568', marginBottom: 4, lineHeight: 18 },
  collapsibleFooter: { fontSize: 12, color: '#4a5568', marginTop: 4, lineHeight: 18 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  rareGroupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rareGroupHeading: { flex: 1 },
  rareGroupDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1e2533', gap: 12 },
  rareEntryDetail: { gap: 6 },
  rareEntryKind: { color: '#a8b2c4' },
  rareOccurrence: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rareOccurrenceDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  rareOccurrenceText: { flex: 1 },
  smallCardTitle: { fontSize: 14, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  pressed: { opacity: 0.7 },
  collapsibleChevron: { fontSize: 14, color: '#6b7a99', lineHeight: 16 },
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
});
