import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import MindSection from '@/components/history/mind-section';
import { CalendarIcon, MoonIcon, NoteIcon, PillIcon, PinIcon } from '@/components/marker-icons';
import { summariseDay, type DaySummaryCheckIn } from '@/lib/summarise-day';
import { CheckIn, Profile, SleepLog } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

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
  onEditMarker: (marker: InterventionMarker) => void;
}

// Scoped port of the web app's DayCard.tsx — deliberately drops what depends
// on features not ported yet: body tracking columns, cycle day numbers,
// cluster/pattern highlighting, and the edit/delete menu for check-ins
// (CheckInMenu, EditCheckInModal). Intervention markers ARE now included
// (ported alongside Settings' marker CRUD). Keeps the part that's genuinely
// self-contained: the day header, the plain-language summary sentence, the
// sleep/marker/notes chips, and the expandable mind sparkline section.
export default function DayCard({ date: _date, dayLabel, fullDateLabel, completedCheckIns, profile, sleepLog, dayMarkers, onEditMarker }: DayCardProps) {
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
    bodyPairs: [],
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

  const hasDetail = mindCount >= 2;

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
          <MindSection completedCheckIns={completedCheckIns} profile={profile} />
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
  expandButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, paddingVertical: 4 },
  expandButtonText: { fontSize: 13, color: '#818cf8' },
  expandedSection: { borderTopWidth: 1, borderTopColor: '#1e2533', padding: 20, paddingTop: 16 },
});
