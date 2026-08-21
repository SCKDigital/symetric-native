import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingCheckbox, OnboardingPrimaryButton } from '@/components/onboarding/onboarding-controls';
import { calculateAge, dateToString, parseDateString } from '@/lib/date-utils';

interface AgeVerificationStepProps {
  dateOfBirth: string;
  ageConfirmed: boolean;
  onUpdate: (updates: { dateOfBirth?: string; ageConfirmed?: boolean }) => void;
  onNext: () => void;
}

const MAX_AGE = 120;

// Ported from the web app's AgeVerificationStep.tsx. The one real mechanic
// swap: a raw <input type="date"> has no RN equivalent, so this uses
// @react-native-community/datetimepicker — a legal age gate is worth a
// proper native picker over freeform day/month/year text entry.
export default function AgeVerificationStep({ dateOfBirth, ageConfirmed, onUpdate, onNext }: AgeVerificationStepProps) {
  const [showPicker, setShowPicker] = useState(false);

  const age = dateOfBirth ? calculateAge(dateOfBirth) : null;
  const isFutureOrInvalid = dateOfBirth ? parseDateString(dateOfBirth) > new Date() : false;
  const isTooOld = age !== null && age > MAX_AGE;
  const isUnder18 = age !== null && age < 18 && !isFutureOrInvalid;
  const canProceed = !!dateOfBirth && ageConfirmed && age !== null && age >= 18 && !isFutureOrInvalid && !isTooOld;

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate) onUpdate({ dateOfBirth: dateToString(selectedDate) });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>When were you born?</Text>
        <Text style={styles.subheading}>Symetric is for adults only.</Text>

        <Pressable onPress={() => setShowPicker(true)} style={styles.dateInput}>
          <Text style={dateOfBirth ? styles.dateInputText : styles.dateInputPlaceholder}>
            {dateOfBirth || 'Select date of birth'}
          </Text>
        </Pressable>

        {showPicker && (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={dateOfBirth ? parseDateString(dateOfBirth) : new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              themeVariant="dark"
              onChange={handleChange}
            />
            {Platform.OS === 'ios' && (
              <Pressable onPress={() => setShowPicker(false)} style={styles.pickerDone}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}
          </View>
        )}

        {isUnder18 && <Text style={styles.errorText}>You must be 18 or older to use Symetric.</Text>}
        {isTooOld && <Text style={styles.errorText}>Please double-check the date you entered.</Text>}

        <View style={styles.checkboxSpacing}>
          <OnboardingCheckbox checked={ageConfirmed} onToggle={() => onUpdate({ ageConfirmed: !ageConfirmed })}>
            I confirm I am 18 years or older.
          </OnboardingCheckbox>
        </View>

        <OnboardingPrimaryButton label="Continue" onPress={onNext} disabled={!canProceed} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 40 },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 16 },
  subheading: { fontSize: 15, color: '#94a3b8', lineHeight: 24, marginBottom: 28 },
  dateInput: { padding: 14, backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 10, marginBottom: 16 },
  dateInputText: { fontSize: 15, color: '#e2e8f0' },
  dateInputPlaceholder: { fontSize: 15, color: '#4a5568' },
  pickerWrap: { marginBottom: 16, backgroundColor: '#141820', borderRadius: 10, overflow: 'hidden' },
  pickerDone: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e2533' },
  pickerDoneText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 13, color: '#f87171', marginBottom: 16, lineHeight: 19 },
  checkboxSpacing: { marginBottom: 28 },
});
