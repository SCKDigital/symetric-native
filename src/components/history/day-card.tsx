import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import MindSection from '@/components/history/mind-section';
import { summariseDay, type DaySummaryCheckIn } from '@/lib/summarise-day';
import { CheckIn, Profile, SleepLog } from '@/lib/supabase';

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

function MoonIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8892a4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </Svg>
  );
}

function NoteIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8892a4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <Path d="M14 3v5h5" />
      <Path d="M9 13h6M9 17h4" />
    </Svg>
  );
}

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
}

// Scoped port of the web app's DayCard.tsx — deliberately drops what depends
// on features not ported yet: intervention markers, body tracking columns,
// cycle day numbers, cluster/pattern highlighting, and the edit/delete menu
// (CheckInMenu, EditCheckInModal). Keeps the part that's genuinely
// self-contained: the day header, the plain-language summary sentence, the
// sleep/notes chips, and the expandable mind sparkline section.
export default function DayCard({ date: _date, dayLabel, fullDateLabel, completedCheckIns, profile, sleepLog }: DayCardProps) {
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

  const chips: { icon: React.ReactNode; label: string }[] = [];
  if (hasSleep) {
    const hoursSuffix = sleepLog!.hours_slept != null ? ` · ${sleepLog!.hours_slept}h` : '';
    chips.push({ icon: <MoonIcon />, label: sleepLog!.skipped ? 'Sleep skipped' : `${getSleepDescriptor(sleepLog!.score)}${hoursSuffix}` });
  }
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
            {chips.map((chip, i) => (
              <View key={i} style={styles.chip}>
                {chip.icon}
                <Text style={styles.chipLabel}>{chip.label}</Text>
              </View>
            ))}
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
