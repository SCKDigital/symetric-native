import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Toggle } from '@/components/settings/settings-primitives';
import { formatWindowTime, type TimeFormat } from '@/lib/time-format';
import { BRAND } from '@/constants/brand';

export interface CheckInPreferencesUpdate {
  checkInsPerDay?: number;
  windowStart?: string;
  windowEnd?: string;
  timeFormat?: TimeFormat;
  dndEnabled?: boolean;
  dndStart?: string;
  dndEnd?: string;
}

interface CheckInPreferencesStepProps {
  checkInsPerDay: number;
  windowStart: string;
  windowEnd: string;
  timeFormat: TimeFormat;
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  onUpdate: (updates: CheckInPreferencesUpdate) => void;
  onNext: () => void;
  onBack: () => void;
}

type PickerField = 'start' | 'end' | 'dndStart' | 'dndEnd';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Ported from the web app's CheckInPreferencesStep.tsx — same copy, same
// 6-hour-minimum window validation. Mechanic swap: <input type="time"> has no
// RN equivalent, so this uses @react-native-community/datetimepicker in
// mode="time" (the same native module the age gate uses in mode="date").
//
// Since extended past that port with the two settings that answer the same
// question and were reachable only from Settings: the 12/24-hour clock, and
// quiet hours. Clock format comes first on the screen deliberately — every
// other time below it is then shown the way the reader has just asked for, so
// the choice demonstrates itself rather than being described. Quiet hours come
// last because they are the exception to everything above them.
//
// The content scrolls now rather than sitting in a centred View: four sections
// do not fit on a phone, and a vertically-centred layout that overflows pushes
// its own buttons off the bottom of the screen with no way to reach them.
export default function CheckInPreferencesStep({
  checkInsPerDay,
  windowStart,
  windowEnd,
  timeFormat,
  dndEnabled,
  dndStart,
  dndEnd,
  onUpdate,
  onNext,
  onBack,
}: CheckInPreferencesStepProps) {
  const [activePicker, setActivePicker] = useState<PickerField | null>(null);

  // Matches ActiveWindowSheet's rule for editing this later — reversed or too-short
  // windows silently break circadian detection and can schedule a check-in before
  // the window even opens.
  const isWindowValid = timeToMinutes(windowEnd) - timeToMinutes(windowStart) >= 360;

  const pickerValueFor = (field: PickerField): string => {
    if (field === 'start') return windowStart;
    if (field === 'end') return windowEnd;
    return field === 'dndStart' ? dndStart : dndEnd;
  };

  const handleTimeChange = (field: PickerField) => (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setActivePicker(null);
      if (event.type === 'dismissed') return;
    }
    if (!selectedDate) return;
    const value = dateToTimeString(selectedDate);
    if (field === 'start') onUpdate({ windowStart: value });
    else if (field === 'end') onUpdate({ windowEnd: value });
    else if (field === 'dndStart') onUpdate({ dndStart: value });
    else onUpdate({ dndEnd: value });
  };

  const timePicker = (field: PickerField) => activePicker === field && (
    <View style={styles.pickerWrap}>
      <DateTimePicker
        value={timeStringToDate(pickerValueFor(field))}
        mode="time"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        themeVariant="dark"
        onChange={handleTimeChange(field)}
      />
      {Platform.OS === 'ios' && (
        <Pressable onPress={() => setActivePicker(null)} style={styles.pickerDone}>
          <Text style={styles.pickerDoneText}>Done</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Mind check-in preferences</Text>

        <View style={styles.section}>
          <Text style={styles.label}>How should times be shown?</Text>
          <View style={styles.countRow}>
            {([
              { value: '12hr' as const, label: '12-hour' },
              { value: '24hr' as const, label: '24-hour' },
            ]).map(option => (
              <Pressable
                key={option.value}
                onPress={() => onUpdate({ timeFormat: option.value })}
                style={[styles.countButton, timeFormat === option.value && styles.countButtonActive]}>
                <Text style={[styles.countButtonText, timeFormat === option.value && styles.countButtonTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>How many check-ins per day?</Text>
          <View style={styles.countRow}>
            {[2, 3, 4].map(num => (
              <Pressable
                key={num}
                onPress={() => onUpdate({ checkInsPerDay: num })}
                style={[styles.countButton, checkInsPerDay === num && styles.countButtonActive]}>
                <Text style={[styles.countButtonText, checkInsPerDay === num && styles.countButtonTextActive]}>{num}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helper}>
            We’ll spread these across your day. You can see when they’re coming and shift one if you need to.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>What are your waking hours?</Text>

          <Text style={styles.sublabel}>I’m usually up by...</Text>
          <Pressable onPress={() => setActivePicker('start')} style={styles.timeInput}>
            <Text style={styles.timeInputText}>{formatWindowTime(windowStart, timeFormat)}</Text>
          </Pressable>
          {timePicker('start')}

          <Text style={[styles.sublabel, styles.sublabelSpaced]}>I’m usually winding down by...</Text>
          <Pressable onPress={() => setActivePicker('end')} style={styles.timeInput}>
            <Text style={styles.timeInputText}>{formatWindowTime(windowEnd, timeFormat)}</Text>
          </Pressable>
          {timePicker('end')}

          {!isWindowValid && <Text style={styles.errorText}>Your window needs to be at least 6 hours, with winding-down after waking-up.</Text>}
        </View>

        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.labelInline}>Quiet hours</Text>
            <Toggle value={dndEnabled} onValueChange={v => onUpdate({ dndEnabled: v })} />
          </View>
          <Text style={styles.helper}>
            No notifications during these hours. Check-ins still appear when you open the app — nothing is skipped, you just aren’t interrupted.
          </Text>

          {dndEnabled && (
            <>
              <Text style={[styles.sublabel, styles.sublabelSpaced]}>From</Text>
              <Pressable onPress={() => setActivePicker('dndStart')} style={styles.timeInput}>
                <Text style={styles.timeInputText}>{formatWindowTime(dndStart, timeFormat)}</Text>
              </Pressable>
              {timePicker('dndStart')}

              <Text style={[styles.sublabel, styles.sublabelSpaced]}>Until</Text>
              <Pressable onPress={() => setActivePicker('dndEnd')} style={styles.timeInput}>
                <Text style={styles.timeInputText}>{formatWindowTime(dndEnd, timeFormat)}</Text>
              </Pressable>
              {timePicker('dndEnd')}
            </>
          )}
        </View>

        <View style={styles.buttonRow}>
          <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={onNext}
            disabled={!isWindowValid}
            style={({ pressed }) => [styles.nextButtonFlex, pressed && isWindowValid && styles.pressed]}>
            <View style={[styles.nextButton, !isWindowValid && styles.nextButtonDisabled]}>
              <Text style={[styles.nextButtonText, !isWindowValid && styles.nextButtonTextDisabled]}>Continue</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: {
    maxWidth: 480, width: '100%', alignSelf: 'center',
    paddingHorizontal: 24, paddingVertical: 32, flexGrow: 1, justifyContent: 'center',
  },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 32 },
  section: { marginBottom: 32 },
  label: { fontSize: 15, color: '#cbd5e1', marginBottom: 16 },
  labelInline: { fontSize: 15, color: '#cbd5e1' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countRow: { flexDirection: 'row', gap: 16 },
  countButton: { flex: 1, paddingVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1a1d28', alignItems: 'center' },
  countButtonActive: { backgroundColor: '#334155', borderColor: '#475569' },
  countButtonText: { fontSize: 16, color: '#cbd5e1' },
  countButtonTextActive: { color: '#e2e8f0', fontWeight: '600' },
  helper: { fontSize: 13, color: '#94a3b8', marginTop: 12, lineHeight: 19 },
  sublabel: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  sublabelSpaced: { marginTop: 16 },
  timeInput: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#1a1d28', borderWidth: 1, borderColor: '#334155', borderRadius: 10 },
  timeInputText: { fontSize: 15, color: '#e2e8f0' },
  pickerWrap: { marginTop: 12, backgroundColor: '#1a1d28', borderRadius: 10, overflow: 'hidden' },
  pickerDone: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155' },
  pickerDoneText: { color: BRAND.text, fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 13, color: '#f87171', marginTop: 12, lineHeight: 19 },
  buttonRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  backButton: { paddingVertical: 12, paddingHorizontal: 24 },
  backButtonText: { fontSize: 15, color: '#94a3b8' },
  nextButtonFlex: { flex: 1 },
  nextButton: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center' },
  nextButtonDisabled: { backgroundColor: '#1e293b' },
  nextButtonText: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  nextButtonTextDisabled: { color: '#64748b' },
  pressed: { opacity: 0.7 },
});
