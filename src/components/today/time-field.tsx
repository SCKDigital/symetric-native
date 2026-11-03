import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { PlatformPicker } from '@/components/shared/platform-picker';
import { formatWindowTime, type TimeFormat } from '@/lib/time-format';
import { makeAccentStyles } from '@/lib/accent-styles';
import { dateToTimeString, timeStringToDate } from '@/lib/date-utils';

/**
 * A tappable HH:MM field backed by the platform time picker (see
 * components/shared/platform-picker.tsx for the per-platform dismissal).
 */
export function TimeField({ value, timeFormat = '24hr', onChange }: {
  value: string;
  /** Display only — the value written is always 'HH:MM'. */
  timeFormat?: TimeFormat;
  onChange: (t: string) => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
        <Text style={styles.text}>{formatWindowTime(value, timeFormat)}</Text>
      </Pressable>
      {open && (
        <PlatformPicker
          variant="plain"
          mode="time"
          value={timeStringToDate(value)}
          is24Hour={timeFormat === '24hr'}
          onPick={selected => onChange(dateToTimeString(selected))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const useStyles = makeAccentStyles(() => ({
  field: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 6,
  },
  text: { fontSize: 15, color: '#e2e8f0' },
  pressed: { opacity: 0.7 },
}));
