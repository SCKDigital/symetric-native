import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import BackRow from '@/components/insights/back-row';
import BodySiteHeatmap from '@/components/insights/body-site-heatmap';
import { DomainSparklineRow } from '@/components/insights/domain-sparkline';
import WhatGoesWithWhatSection from '@/components/insights/correlation-section';
import FindingCard from '@/components/insights/finding-card';
import {
  CollapsibleRow, countRareDayGroups, RareDayGroups,
  WhatComesBeforeWhatSection, WhenItHappensSection,
} from '@/components/insights/pattern-sections';
import type { CircadianPattern } from '@/lib/circadian-detection';
import type { ConnectionRow } from '@/lib/correlation-groups';
import { formatShortDate } from '@/lib/date-utils';
import { rollingBodyBaseline } from '@/lib/detection/body-baseline';
import type { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { RareEvent } from '@/lib/detection/rare-events';
import { BODY_COLOR } from '@/lib/domains';
import { PatternFinding } from '@/lib/pattern-findings';
import type { BodyDomainSummary, BodyEventOccurrence, BodyEventSummary, BodySiteFrequency } from '@/lib/report/types';
import { rankFindings } from '@/lib/standout-ranking';
import type { DetectedCluster } from '@/lib/supabase';

// The "Body" drill-down.
//
// This used to be three flat sections — per-domain averages, event counts,
// nothing tappable. Two consequences. Body-domain day-of-week and
// what-follows-what findings had nowhere to live, so the only place they
// appeared was an unscoped list at the foot of the Insights index, next to the
// identical mind ones. And every descriptive thing a body check-in captures —
// which dates, the free-text note, the pain/breathlessness character tags —
// was written to the database and read by nothing, on either app.
// `pain_character` in particular had been collected for months and never once
// shown back to the person who typed it.
//
// So the numbers are the way *in* rather than the whole answer: a domain row
// still leads with its average, and opens onto the days behind it.
//
// The findings above those numbers now sit in the same four buckets the Mind
// screen uses, in the same order — see pattern-sections.tsx. Before that they
// were one flat "Patterns" list printed in detector order, with no ranking and
// no cap, and the day-of-week/lag/rare-event cards in it were rendered a second
// time by the sections underneath.

interface DomainDay {
  date: string;
  /** Evening reading — the one every domain has. */
  pm: number | null;
  /** Morning reading, for the domains the optional morning form covers. */
  am: number | null;
  note: string | null;
  tags: string[];
}

interface Props {
  onBack: () => void;
  domains: BodyDomainSummary[];
  events: BodyEventSummary[];
  eventOccurrences: BodyEventOccurrence[];
  /** Per-site day counts over the range, for the map. */
  siteFrequency: BodySiteFrequency[];
  /** Range-scoped body_checkins rows, for the per-domain day breakdown. */
  checkInRows: Record<string, unknown>[];
  daysLogged: number;
  /** Clusters, evolution and event-frequency findings — the "what's changed" bucket. */
  changedFindings: PatternFinding[];
  /** Same-day correlations involving a body domain, ungrouped. */
  connectionRows: ConnectionRow[];
  /** "X rises in the days after Y" — belongs with the lag relationships. */
  impactFindings: PatternFinding[];
  /** Morning-vs-evening — belongs with the day-of-week and circadian patterns. */
  timeOfDayFindings: PatternFinding[];
  rareEvents: RareEvent[];
  /** Intraday swings for body domains, shown as rare days rather than patterns. */
  volatilityClusters: DetectedCluster[];
  lagRelationships: LagRelationship[];
  dayOfWeekPatterns: DayOfWeekPattern[];
  circadianPatterns: CircadianPattern[];
  daysOfData: number;
}

/** Which character-tag column, if any, describes this domain. */
function tagColumnFor(domain: string): string | null {
  if (domain === 'pain_mechanical' || domain === 'pain_widespread') return 'pain_character';
  if (domain === 'breathlessness') return 'breathlessness_character';
  return null;
}

function daysForDomain(rows: Record<string, unknown>[], domain: string): DomainDay[] {
  const tagCol = tagColumnFor(domain);
  const out: DomainDay[] = [];
  for (const r of rows) {
    const pm = (r[domain] as number | null | undefined) ?? null;
    const am = (r[`morning_${domain}`] as number | null | undefined) ?? null;
    if (pm === null && am === null) continue;
    out.push({
      date: r.entry_date as string,
      pm,
      am,
      note: (r.note as string | null) ?? null,
      // Only attached to the domains the tags actually describe — how the pain
      // felt says nothing about gut or fatigue.
      tags: tagCol ? ((r[tagCol] as string[] | null) ?? []) : [],
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The readings for one day, as words rather than as column names.
 *
 * This printed the raw shape — "pm 3", or "am 2 · pm 3" — which reads as a time
 * of day rather than as the check-in it came from, and is doubly confusing for
 * anyone on the 12-hour clock, where "pm 7" could be a time. Most days have
 * only the evening reading, and on those the label carries nothing at all: the
 * number is the reading, and the date beside it already says which day.
 */
function dayValueText(day: DomainDay): string {
  if (day.am === null) return String(day.pm);
  if (day.pm === null) return `Morning ${day.am}`;
  return `Morning ${day.am} · Evening ${day.pm}`;
}

function DayRow({ date, children }: { date: string; children: React.ReactNode }) {
  return (
    <View style={styles.dayRow}>
      <Text style={styles.dayDate}>{formatShortDate(date)}</Text>
      <View style={styles.dayBody}>{children}</View>
    </View>
  );
}

export default function BodyAreaDetail({
  onBack, domains, events, eventOccurrences, siteFrequency, checkInRows, daysLogged,
  changedFindings, connectionRows, impactFindings, timeOfDayFindings,
  rareEvents, volatilityClusters, lagRelationships, dayOfWeekPatterns, circadianPatterns, daysOfData,
}: Props) {
  // Ranked, not detector-ordered: firmest evidence first, then most recent,
  // then largest effect. The top one gets the lead treatment.
  // One expanded row at a time, keyed by domain — or by "<domain>:morning",
  // since a morning series is its own row.
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const ranked = rankFindings(changedFindings);
  const [lead, ...rest] = ranked;
  const rareGroupCount = countRareDayGroups(rareEvents, volatilityClusters);
  const changedCount = ranked.length + rareGroupCount;

  const occurrencesByType = new Map<string, BodyEventOccurrence[]>();
  for (const o of eventOccurrences) {
    const list = occurrencesByType.get(o.eventType);
    if (list) list.push(o);
    else occurrencesByType.set(o.eventType, [o]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <BackRow label="Body" onBack={onBack} />

      {changedCount === 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What’s changed</Text>
          <Text style={styles.emptyText}>Nothing standing out yet. This usually needs a few weeks of body check-ins.</Text>
        </View>
      ) : (
        <CollapsibleRow label="What’s changed" defaultOpen meta={`${changedCount}`}>
          {lead && <FindingCard finding={lead} lead accent={BODY_COLOR} />}
          {rest.map(f => (
            <FindingCard key={`${f.patternSource ?? 'x'}-${f.id}`} finding={f} accent={BODY_COLOR} />
          ))}
          <RareDayGroups events={rareEvents} volatilityClusters={volatilityClusters} daysOfData={daysOfData} />
        </CollapsibleRow>
      )}

      <WhatGoesWithWhatSection rows={connectionRows} />
      <WhatComesBeforeWhatSection relationships={lagRelationships} impactFindings={impactFindings} />
      <WhenItHappensSection circadian={circadianPatterns} dayOfWeek={dayOfWeekPatterns} timeOfDayFindings={timeOfDayFindings} />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Symptom levels</Text>
        <Text style={styles.daysLoggedText}>
          {daysLogged} day{daysLogged !== 1 ? 's' : ''} logged in this window · tap a symptom for its readings
        </Text>

        {domains.length === 0 ? (
          <Text style={styles.emptyText}>No body check-ins logged in this window yet.</Text>
        ) : (
          <View style={styles.list}>
            {domains.flatMap(d => {
              // Newest first for reading; the chart wants the opposite.
              const days = daysForDomain(checkInRows, d.domain);
              const chronological = [...days].reverse();
              const evening = chronological.filter(x => x.pm !== null).map(x => x.pm!);
              const morning = chronological.filter(x => x.am !== null).map(x => x.am!);
              const notable = days.filter(x => x.note || x.tags.length > 0);

              // A domain can have morning readings and no evening ones — `pain`
              // is exactly that since the mechanical/widespread split, because
              // the morning form still asks it while the evening form no longer
              // does. Rendering an empty evening row for it would put a bar at
              // the baseline and the word "stable" against no data at all.
              const rows = evening.length === 0 ? [] : [
                <DomainSparklineRow
                  key={d.domain}
                  label={d.label}
                  color={BODY_COLOR}
                  values={evening}
                  baseline={rollingBodyBaseline(evening)}
                  scaleMin={0}
                  isExpanded={expandedDomain === d.domain}
                  onToggle={() => setExpandedDomain(prev => (prev === d.domain ? null : d.domain))}>
                  {notable.length > 0 && (
                    <View style={styles.notableList}>
                      {notable.map(day => (
                        <DayRow key={day.date} date={day.date}>
                          <Text style={styles.dayValue}>{dayValueText(day)}</Text>
                          {day.tags.length > 0 && (
                            <View style={styles.tagRow}>
                              {day.tags.map(t => <Text key={t} style={styles.tag}>{t}</Text>)}
                            </View>
                          )}
                          {day.note ? <Text style={styles.dayNote}>{day.note}</Text> : null}
                        </DayRow>
                      ))}
                    </View>
                  )}
                </DomainSparklineRow>,
              ];

              // A separate line, never merged into the evening one. Waking stiff
              // and crashing at 9pm are two different measurements of the same
              // symptom, and averaging them is how a morning-only pattern
              // disappears — which is the whole reason the morning check-in
              // writes its own columns.
              if (morning.length > 0) {
                const morningKey = `${d.domain}:morning`;
                rows.push(
                  <DomainSparklineRow
                    key={morningKey}
                    label={`${d.label} · on waking`}
                    color={BODY_COLOR}
                    values={morning}
                    baseline={rollingBodyBaseline(morning)}
                    scaleMin={0}
                    isExpanded={expandedDomain === morningKey}
                    onToggle={() => setExpandedDomain(prev => (prev === morningKey ? null : morningKey))}
                  />,
                );
              }

              return rows;
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Where it shows up</Text>
        <Text style={styles.daysLoggedText}>Pain, instability and event sites across the selected range. Brighter means logged on more days.</Text>
        <BodySiteHeatmap sites={siteFrequency} />
      </View>

      {events.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Events</Text>
          <View style={styles.list}>
            {events.map(e => {
              const occurrences = occurrencesByType.get(e.eventType) ?? [];
              return (
                <View key={e.eventType} style={styles.domainCard}>
                  <CollapsibleRow label={e.label} meta={`${e.count}×`}>
                    {occurrences.length === 0 ? (
                      <Text style={styles.emptyText}>No dates recorded.</Text>
                    ) : occurrences.map((o, i) => (
                      <DayRow key={`${o.date}-${i}`} date={o.date}>
                        {/* The event's own descriptor first — where it happened,
                            or what it felt like — then the day's note, which is
                            about the whole day rather than this event. */}
                        {o.detail ? <Text style={styles.dayValue}>{o.detail}</Text> : null}
                        {o.context ? <Text style={styles.dayNote}>{o.context}</Text> : null}
                        {!o.detail && !o.context
                          ? <Text style={styles.dayNoteEmpty}>Logged, no further detail</Text>
                          : null}
                      </DayRow>
                    ))}
                  </CollapsibleRow>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24, paddingBottom: 48 },
  section: { gap: 0 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#8892a4', lineHeight: 20 },
  list: { gap: 10 },
  daysLoggedText: { fontSize: 12, color: '#4a5568', marginBottom: 10, lineHeight: 17 },
  domainCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 4, borderLeftColor: BODY_COLOR, borderRadius: 12, padding: 14, paddingHorizontal: 16 },
  dayRow: { flexDirection: 'row', gap: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#1e2533' },
  dayDate: { fontSize: 12, color: '#6b7a99', width: 54, paddingTop: 1 },
  dayBody: { flex: 1, gap: 5 },
  notableList: { marginTop: 12, gap: 2 },
  dayValue: { fontSize: 13, color: '#c8d0e0' },
  dayNote: { fontSize: 12, color: '#8892a4', lineHeight: 17, fontStyle: 'italic' },
  dayNoteEmpty: { fontSize: 12, color: '#3d4b60', fontStyle: 'italic' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontSize: 11, color: '#9aabb8', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
});
