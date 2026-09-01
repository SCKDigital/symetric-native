import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import BodySection from '@/components/history/body-section';
import MindSection from '@/components/history/mind-section';
import { CalendarIcon, MoonIcon, NoteIcon, PillIcon, PinIcon } from '@/components/marker-icons';
import { formatEventLabel, formatPainSiteLabel } from '@/lib/body/format-body-event';
import { BODY_DOMAIN_ORDER, MORNING_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import type { BodyColumnMode } from '@/lib/history/day-card-helpers';
import { summariseDay, type BodyReadingPair, type DaySummaryCheckIn } from '@/lib/summarise-day';
import { BodyCheckIn, BodyEvent, BodyEventSite, BodyPainSite, CheckIn, Profile, SleepLog } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

/** Same-day am/pm pairs for the body-direction clause — only domains logged
 *  at both times of day count (see BodyReadingPair). */
function buildBodyPairs(columnMode: Exclude<BodyColumnMode, 'off'> | 'off', bodyEntry?: BodyCheckIn): BodyReadingPair[] {
  if (columnMode !== 'twice' || !bodyEntry) return [];
  const pairs: BodyReadingPair[] = [];
  for (const key of MORNING_BODY_DOMAIN_ORDER) {
    const am = bodyEntry[`morning_${key}` as keyof BodyCheckIn] as number | null | undefined;
    const pm = bodyEntry[key] as number | null | undefined;
    if (am != null && pm != null) pairs.push({ am, pm });
  }
  return pairs;
}

function getSleepDescriptor(score: number | null): string {
  switch (score) {
    case 1:
      return 'Very poor';
    case 2:
      return 'Poor';
    case 3:
      return 'Average';
    case 4:
      return 'Well';
    case 5:
      return 'Very well';
    default:
      return '';
  }
}

// Sleep is intentionally not in this table: it's handled inline below, not
// as an InterventionMarker. Cycle-phase markers never appear in the marker
// row at all (they're context for a future cycle Day-N view, not ported).
const MARKER_ICON: Partial<Record<InterventionMarker['marker_type'], typeof PillIcon>> = {
  medication: PillIcon,
  therapy: CalendarIcon,
  life_event: PinIcon,
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export interface DayCardProps {
  date: string;
  dayLabel: string;
  fullDateLabel: string;
  completedCheckIns: CheckIn[];
  profile: Profile | null | undefined;
  sleepLog: SleepLog | null;
  dayMarkers: InterventionMarker[];
  bodyColumnMode: BodyColumnMode;
  bodyEntry?: BodyCheckIn;
  bodyPainSites: BodyPainSite[];
  bodyEvents: (BodyEvent & { body_event_sites: BodyEventSite[] })[];
  onEditMarker: (marker: InterventionMarker) => void;
}

// Scoped port of the web app's DayCard.tsx — deliberately drops what depends
// on features not ported yet: cycle day numbers, cluster/pattern
// highlighting, and the edit/delete menu for check-ins (CheckInMenu,
// EditCheckInModal). Intervention markers and body tracking (chunk 2 of the
// body-tracking port) ARE now included. Keeps the part that's genuinely
// self-contained: the day header, the plain-language summary sentence, the
// sleep/marker/notes chips, and the expandable mind sparkline + body section.
export default function DayCard({
  date: _date, dayLabel, fullDateLabel, completedCheckIns, profile, sleepLog, dayMarkers,
  bodyColumnMode, bodyEntry, bodyPainSites, bodyEvents, onEditMarker,
}: DayCardProps) {
  const [expanded, setExpanded] = useState(false);

  const mindCount = completedCheckIns.length;

  const summaryText = summariseDay({
    checkIns: completedCheckIns.map(
      (ci): DaySummaryCheckIn => ({
        time: ci.completed_at || ci.scheduled_at,
        values: {
          mood: ci.mood,
          energy: ci.energy,
          anxiety: ci.anxiety,
          concentration: ci.concentration,
          irritability: ci.irritability,
          social_battery: ci.social_battery,
          sensory_sensitivity: ci.sensory_sensitivity,
          motivation: ci.motivation,
        },
      }),
    ),
    bodyPairs: buildBodyPairs(bodyColumnMode, bodyEntry),
  });

  const hasSleep = !!sleepLog && (sleepLog.skipped || sleepLog.score !== null);
  const hasNotes = completedCheckIns.some(ci => ci.notes);
  const rowMarkers = dayMarkers.filter(m => m.marker_type !== 'cycle_phase');

  const chips: { icon: React.ReactNode; label: string; onPress?: () => void }[] = [];
  if (hasSleep) {
    const hoursSuffix = sleepLog!.hours_slept != null ? ` · ${sleepLog!.hours_slept}h` : '';
    chips.push({ icon: <MoonIcon />, label: sleepLog!.skipped ? 'Sleep skipped' : `${getSleepDescriptor(sleepLog!.score)}${hoursSuffix}` });
  }
  rowMarkers.forEach(m => {
    const Icon = MARKER_ICON[m.marker_type] ?? PinIcon;
    chips.push({ icon: <Icon />, label: m.label, onPress: () => onEditMarker(m) });
  });
  if (hasNotes) chips.push({ icon: <NoteIcon />, label: 'Note' });

  // Pain and joint-instability sites share one body map (see BodyCheckIn's
  // "Where does it hurt or feel unstable?" prompt) — there's no per-domain
  // split in body_pain_sites, so the label names both rather than picking one.
  const sitesLabel = bodyEntry?.pain_diffuse
    ? 'Pain/Instability: diffuse'
    : (bodyPainSites.length > 0 ? `Pain/Instability: ${formatPainSiteLabel(bodyPainSites) ?? ''}` : undefined);
  const eventLabels = bodyEvents.map(formatEventLabel);
  // Body data is entered independently of mind check-ins (someone can log a
  // crash day without a single mind check-in) — it must never be hidden
  // behind a mind-check-in-count threshold, only behind bodyColumnMode itself.
  const hasBodyDomainValue = !!bodyEntry && (
    BODY_DOMAIN_ORDER.some(d => bodyEntry[d] != null) ||
    MORNING_BODY_DOMAIN_ORDER.some(d => bodyEntry[`morning_${d}` as keyof BodyCheckIn] != null)
  );
  const hasBodyData = bodyColumnMode !== 'off' && (hasBodyDomainValue || eventLabels.length > 0 || !!sitesLabel || !!bodyEntry?.note);

  const hasDetail = mindCount >= 2 || hasBodyData;

  return (
    <Pressable onPress={hasDetail ? () => setExpanded(e => !e) : undefined} style={styles.card}>
      <View style={styles.padding}>
        <View style={styles.headerRow}>
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          <Text style={styles.countLabel}>
            {mindCount} check-in{mindCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Text style={styles.fullDate}>{fullDateLabel}</Text>

        <Text style={styles.summary}>{summaryText}</Text>

        {chips.length > 0 && (
          <View style={styles.chipRow}>
            {chips.slice(0, 4).map((chip, i) =>
              chip.onPress ? (
                <Pressable key={i} onPress={chip.onPress} style={styles.chip}>
                  {chip.icon}
                  <Text style={styles.chipLabel}>{chip.label}</Text>
                </Pressable>
              ) : (
                <View key={i} style={styles.chip}>
                  {chip.icon}
                  <Text style={styles.chipLabel}>{chip.label}</Text>
                </View>
              ),
            )}
          </View>
        )}

        {hasDetail && (
          <Pressable onPress={() => setExpanded(x => !x)} style={styles.expandButton}>
            <Text style={styles.expandButtonText}>{expanded ? 'Hide the day' : 'Show the day'}</Text>
            <ChevronIcon expanded={expanded} />
          </Pressable>
        )}
      </View>

      {expanded && hasDetail && (
        <View style={styles.expandedSection}>
          {mindCount >= 2 && <MindSection completedCheckIns={completedCheckIns} profile={profile} />}
          {bodyColumnMode !== 'off' && (
            <View style={mindCount >= 2 ? styles.bodySectionSpaced : undefined}>
              <BodySection bodyEntry={bodyEntry} columnMode={bodyColumnMode} sitesLabel={sitesLabel} eventLabels={eventLabels} />
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, overflow: 'hidden' },
  padding: { padding: 16, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 },
  dayLabel: { fontSize: 15, fontWeight: '500', color: '#c8d0e0' },
  countLabel: { fontSize: 12, color: '#4a5568' },
  fullDate: { fontSize: 12, color: '#8892a4', marginBottom: 10 },
  summary: { fontSize: 14, color: '#b0b8c8', lineHeight: 21.7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1e2533', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 9 },
  chipLabel: { fontSize: 11, color: '#8892a4' },
  bodySectionSpaced: { marginTop: 20 },
  expandButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, paddingVertical: 4 },
  expandButtonText: { fontSize: 13, color: '#818cf8' },
  expandedSection: { borderTopWidth: 1, borderTopColor: '#1e2533', padding: 20, paddingTop: 16 },
});
