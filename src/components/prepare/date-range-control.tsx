import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, dateToString, parseDateString, todayDateString } from '@/lib/date-utils';
import { defaultRangeForPreset, weeksBetween, type PrepareRange } from '@/lib/prepare-range';
import type { InterventionMarker } from '@/types/marker';

function fmtLabel(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  range: PrepareRange;
  onChange: (r: PrepareRange) => void;
  lastVisitDate: string | null;
  mostRecentMarker: InterventionMarker | null;
}

const PRESETS: ('14' | '30' | '60' | '90')[] = ['14', '30', '60', '90'];

// Ported from the web app's DateRangeControl (defined inline in
// PrepareScreen.tsx). Mechanic swaps: two <input type="date"> fields ->
// one @react-native-community/datetimepicker shared between the start/end
// pills, tracked by which field is currently being edited.
export default function DateRangeControl({ range, onChange, lastVisitDate, mostRecentMarker }: Props) {
  const [today] = useState(() => todayDateString());
  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null);
  const isCustom = range.preset === 'custom';

  function applyPreset(p: '14' | '30' | '60' | '90') {
    onChange(defaultRangeForPreset(p, today));
  }

  function applySinceVisit() {
    if (!lastVisitDate) return;
    onChange({ preset: 'since_visit', start: lastVisitDate, end: today });
  }

  function applySinceMarker() {
    if (!mostRecentMarker) return;
    onChange({ preset: 'since_marker', start: mostRecentMarker.marker_date, end: today });
  }

  function applyCustom(start: string, end: string) {
    const clampedEnd = end > today ? today : end;
    const clampedStart = start > clampedEnd ? addDays(clampedEnd, -1) : start;
    onChange({ preset: 'custom', start: clampedStart, end: clampedEnd });
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') setEditingField(null);
    if (event.type === 'dismissed' || !selectedDate || !editingField) return;
    const value = dateToString(selectedDate);
    if (editingField === 'start') applyCustom(value, range.end);
    else applyCustom(range.start, value);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Date range</Text>

      <View style={styles.pillRow}>
        {PRESETS.map(p => (
          <Pressable key={p} onPress={() => applyPreset(p)} style={[styles.pill, range.preset === p && styles.pillActive]}>
            <Text style={[styles.pillText, range.preset === p && styles.pillTextActive]}>{p} days</Text>
          </Pressable>
        ))}
        {lastVisitDate && (
          <Pressable onPress={applySinceVisit} style={[styles.pill, range.preset === 'since_visit' && styles.pillActive]}>
            <Text style={[styles.pillText, range.preset === 'since_visit' && styles.pillTextActive]}>Since last visit</Text>
          </Pressable>
        )}
        {mostRecentMarker && (
          <Pressable onPress={applySinceMarker} style={[styles.pill, range.preset === 'since_marker' && styles.pillActive]}>
            <Text style={[styles.pillText, range.preset === 'since_marker' && styles.pillTextActive]}>Since {mostRecentMarker.label}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { if (!isCustom) applyCustom(addDays(today, -30), today); }} style={[styles.pill, isCustom && styles.pillActive]}>
          <Text style={[styles.pillText, isCustom && styles.pillTextActive]}>Custom</Text>
        </Pressable>
      </View>

      {isCustom && (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>Start</Text>
            <Pressable onPress={() => setEditingField('start')} style={styles.customInput}>
              <Text style={styles.customInputText}>{range.start}</Text>
            </Pressable>
          </View>
          <Text style={styles.customDash}>-</Text>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>End</Text>
            <Pressable onPress={() => setEditingField('end')} style={styles.customInput}>
              <Text style={styles.customInputText}>{range.end}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {editingField && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={parseDateString(editingField === 'start' ? range.start : range.end)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={parseDateString(today)}
            themeVariant="dark"
            onChange={handleDateChange}
          />
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => setEditingField(null)} style={styles.pickerDone}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.summary}>{fmtLabel(range.start)} to {fmtLabel(range.end)} · {weeksBetween(range.start, range.end)} weeks</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 18, paddingHorizontal: 20, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 12 },
  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#2d3748' },
  pillActive: { borderWidth: 0, backgroundColor: '#4f46e5' },
  pillText: { fontSize: 13, fontWeight: '500', color: '#8892a4' },
  pillTextActive: { color: '#fff' },
  customRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' },
  customField: { gap: 3 },
  customLabel: { fontSize: 11, color: '#6b7a99' },
  customInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  customInputText: { fontSize: 13, color: '#c8d0e0' },
  customDash: { color: '#4a5568', marginBottom: 8 },
  pickerWrap: { marginBottom: 10, backgroundColor: '#0a0c12', borderRadius: 10, overflow: 'hidden' },
  pickerDone: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e2533' },
  pickerDoneText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },
  summary: { fontSize: 12, color: '#4a5568' },
});
