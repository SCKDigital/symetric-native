import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChevronRight, SheetButton, SheetCancel, SheetShell } from '@/components/settings/settings-primitives';
import { formatWindowTime } from '@/components/settings/settings-sheets';
import { localTimeToUTC, timeOfDayInTZ } from '@/lib/scheduler';
import type { CheckIn, CheckInSettings } from '@/lib/supabase';
import { formatTime, type TimeFormat } from '@/lib/time-format';

// Ports of the web app's RescheduleListSheet and RescheduleTimePickerSheet
// from today/TodayCards.tsx. Today's next-check-in block has always shown a
// "Reschedule" link on the web; the native screen omitted it rather than ship
// a dead one, which left no way to move a check-in that lands at a bad moment.
//
// The validation is the part that matters and is ported unchanged: a new time
// has to fall inside the active window, be in the future, and sit at least 60
// minutes from every other check-in that day — including completed ones, since
// two check-ins an hour apart are near-duplicate samples of the same mood, and
// the detectors would read them as independent evidence.

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Step 1: which check-in ───────────────────────────────────────────────────

export function RescheduleListSheet({ allCheckIns, timeFormat, onSelect, onClose }: {
  allCheckIns: CheckIn[];
  timeFormat: TimeFormat;
  onSelect: (checkIn: CheckIn) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const sorted = [...allCheckIns].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
  const isEditable = (ci: CheckIn) => ci.status === 'pending' && new Date(ci.expires_at) > now;

  return (
    <SheetShell title="Reschedule a mind check-in" description="Tap a check-in to move it." onClose={onClose}>
      <View style={styles.list}>
        {sorted.map(ci => {
          const editable = isEditable(ci);
          const statusLabel = ci.status === 'completed' ? 'Done' : ci.status === 'expired' ? 'Missed' : 'Upcoming';
          return (
            <Pressable
              key={ci.id}
              onPress={editable ? () => onSelect(ci) : undefined}
              disabled={!editable}
              style={({ pressed }) => [styles.listRow, !editable && styles.listRowDisabled, pressed && editable && styles.pressed]}>
              <Text style={[styles.listTime, !editable && styles.listTimeDisabled]}>
                {formatTime(ci.scheduled_at, timeFormat)}
              </Text>
              <View style={styles.listRight}>
                <Text style={[styles.listStatus, !editable && styles.listTimeDisabled]}>{statusLabel}</Text>
                {editable && <ChevronRight color="#4a5568" />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Step 2: what time ────────────────────────────────────────────────────────

export function RescheduleTimePickerSheet({ checkIn, settings, allCheckIns, timeFormat, timezone, onConfirm, onBack, onClose }: {
  checkIn: CheckIn;
  settings: CheckInSettings;
  allCheckIns: CheckIn[];
  timeFormat: TimeFormat;
  timezone: string;
  onConfirm: (newTimeIso: string) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}) {
  const [timeValue, setTimeValue] = useState(() => {
    const { hours, minutes } = timeOfDayInTZ(new Date(checkIn.scheduled_at), timezone);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setPicking(false);
    if (event.type === 'dismissed' || !selected) return;
    setTimeValue(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
  };

  const handleConfirm = async () => {
    setError('');
    const [hours, minutes] = timeValue.split(':').map(Number);
    const [winStartH, winStartM] = settings.window_start.split(':').map(Number);
    const [winEndH, winEndM] = settings.window_end.split(':').map(Number);

    const pickedMinutes = hours * 60 + minutes;
    const winStartMinutes = winStartH * 60 + winStartM;
    const winEndMinutes = winEndH * 60 + winEndM;

    const now = new Date();
    const { hours: nowH, minutes: nowM } = timeOfDayInTZ(now, timezone);
    const nowMinutes = nowH * 60 + nowM;

    if (nowMinutes >= winEndMinutes) {
      setError("There's no time left in your active window today.");
      return;
    }
    if (pickedMinutes < winStartMinutes || pickedMinutes > winEndMinutes) {
      setError(`That time is outside your active window (${formatWindowTime(settings.window_start, timeFormat)} - ${formatWindowTime(settings.window_end, timeFormat)}).`);
      return;
    }
    if (pickedMinutes <= nowMinutes) {
      setError('Pick a time in the future.');
      return;
    }

    for (const other of allCheckIns.filter(c => c.id !== checkIn.id)) {
      const { hours: otherH, minutes: otherM } = timeOfDayInTZ(new Date(other.scheduled_at), timezone);
      const otherMinutes = otherH * 60 + otherM;
      if (Math.abs(pickedMinutes - otherMinutes) < 60) {
        const beforeTime = formatWindowTime(minutesToHHMM(Math.max(0, otherMinutes - 60)), timeFormat);
        const afterTime = formatWindowTime(minutesToHHMM(Math.min(1439, otherMinutes + 60)), timeFormat);
        setError(`Too close to another check-in. Must be before ${beforeTime} or after ${afterTime}.`);
        return;
      }
    }

    setSaving(true);
    const todayLocalStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
    await onConfirm(localTimeToUTC(todayLocalStr, timeValue, timezone).toISOString());
    setSaving(false);
  };

  return (
    <SheetShell title="Reschedule mind check-in" description="Pick a new time within your active window." onClose={onClose}>
      <Pressable onPress={onBack} style={styles.backRow}>
        <Text style={styles.backText}>‹ All check-ins</Text>
      </Pressable>

      <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [styles.timeInput, pressed && styles.pressed]}>
        <Text style={styles.timeInputText}>{formatWindowTime(timeValue, timeFormat)}</Text>
      </Pressable>
      {picking && (
        <DateTimePicker
          value={timeStringToDate(timeValue)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}
      {picking && Platform.OS === 'ios' && (
        <Pressable onPress={() => setPicking(false)}><Text style={styles.done}>Done</Text></Pressable>
      )}

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <SheetButton label={saving ? 'Saving...' : 'Set new time'} onPress={handleConfirm} disabled={saving} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  list: { gap: 8, marginBottom: 8 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#1a1f2e', borderWidth: 1, borderColor: '#2d3758', borderRadius: 12,
  },
  listRowDisabled: { backgroundColor: '#111318', borderColor: '#1a1f2e' },
  listTime: { fontSize: 15, fontWeight: '500', color: '#c8d0e0' },
  listTimeDisabled: { color: '#4a5568' },
  listRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listStatus: { fontSize: 13, color: '#818cf8' },

  backRow: { paddingBottom: 14 },
  backText: { fontSize: 13, color: '#818cf8' },
  timeInput: {
    backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 16,
  },
  timeInputText: { fontSize: 20, fontWeight: '600', color: '#e2e8f0' },
  done: { fontSize: 14, color: '#818cf8', textAlign: 'center', paddingVertical: 8 },
  error: { fontSize: 12, color: '#f87171', marginBottom: 12 },
});
