import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CheckInPreferencesStepProps {
  checkInsPerDay: number;
  windowStart: string;
  windowEnd: string;
  onUpdate: (updates: { checkInsPerDay?: number; windowStart?: string; windowEnd?: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

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
export default function CheckInPreferencesStep({
  checkInsPerDay,
  windowStart,
  windowEnd,
  onUpdate,
  onNext,
  onBack,
}: CheckInPreferencesStepProps) {
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);

  // Matches ActiveWindowSheet's rule for editing this later — reversed or too-short
  // windows silently break circadian detection and can schedule a check-in before
  // the window even opens.
  const isWindowValid = timeToMinutes(windowEnd) - timeToMinutes(windowStart) >= 360;

  const handleTimeChange = (field: 'start' | 'end') => (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setActivePicker(null);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate) {
      onUpdate(field === 'start' ? { windowStart: dateToTimeString(selectedDate) } : { windowEnd: dateToTimeString(selectedDate) });
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>Mind check-in preferences</Text>

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
            <Text style={styles.timeInputText}>{windowStart}</Text>
          </Pressable>

          <Text style={[styles.sublabel, styles.sublabelSpaced]}>I’m usually winding down by...</Text>
          <Pressable onPress={() => setActivePicker('end')} style={styles.timeInput}>
            <Text style={styles.timeInputText}>{windowEnd}</Text>
          </Pressable>

          {activePicker && (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={timeStringToDate(activePicker === 'start' ? windowStart : windowEnd)}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="dark"
                onChange={handleTimeChange(activePicker)}
              />
              {Platform.OS === 'ios' && (
                <Pressable onPress={() => setActivePicker(null)} style={styles.pickerDone}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </Pressable>
              )}
            </View>
          )}

          {!isWindowValid && <Text style={styles.errorText}>Your window needs to be at least 6 hours, with winding-down after waking-up.</Text>}
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 32 },
  section: { marginBottom: 32 },
  label: { fontSize: 15, color: '#cbd5e1', marginBottom: 16 },
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
  pickerDoneText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },
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
