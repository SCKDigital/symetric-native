import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { formatWindowTime, type TimeFormat } from '@/lib/time-format';

/**
 * A tappable HH:MM field backed by the platform time picker.
 *
 * The same pattern check-in-preferences-step.tsx uses inline for the waking
 * window, pulled out so the body setup card can reuse it rather than growing a
 * third copy of the Android show/hide dance.
 */
function toDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TimeField({ value, timeFormat = '24hr', onChange }: {
  value: string;
  /** Display only — the value written is always 'HH:MM'. */
  timeFormat?: TimeFormat;
  onChange: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const handle = (event: DateTimePickerEvent, selected?: Date) => {
    // Android fires once and owns its own dismissal; iOS keeps the spinner
    // mounted until it's closed explicitly.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(toTimeString(selected));
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
        <Text style={styles.text}>{formatWindowTime(value, timeFormat)}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={toDate(value)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handle}
        />
      )}
      {open && Platform.OS === 'ios' && (
        <Pressable onPress={() => setOpen(false)}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 6,
  },
  text: { fontSize: 15, color: '#e2e8f0' },
  done: { fontSize: 14, color: '#818cf8', textAlign: 'center', paddingVertical: 10 },
  pressed: { opacity: 0.7 },
});
