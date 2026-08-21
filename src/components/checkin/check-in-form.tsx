import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import DomainSlider from '@/components/checkin/domain-slider';
import { useAuth } from '@/contexts/auth-context';
import { trackCheckInCompleted } from '@/lib/analytics';
import { getDomainColorFromProfile, DOMAIN_COPY } from '@/lib/domains';
import { CheckIn, DomainType, supabase } from '@/lib/supabase';

interface CheckInFormProps {
  checkIn: CheckIn;
  activeDomains: DomainType[];
  baselines: Record<DomainType, number>;
  completedCount: number;
  totalCount: number;
  onComplete: () => void;
  /** Pre-fill sliders with existing values (edit mode). */
  initialValues?: Partial<Record<DomainType, number>>;
  /** Pre-fill notes field (edit mode). */
  initialNotes?: string;
  /** Override the submit button label. Defaults to "Done". */
  submitButtonText?: string;
  /** If provided, called with the just-saved CheckIn instead of showing the internal confirmation screen. */
  onCompleted?: (completedCheckIn: CheckIn) => void;
  /** When true, shows "QUICK MIND CHECK-IN" header instead of "NOW · MIND CHECK-IN". */
  quickCheckInMode?: boolean;
}

// Ported from the web app's CheckInForm.tsx — same props, same save shape
// (a plain `check_ins` update, no new columns), same confirmation screen.
export default function CheckInForm({
  checkIn,
  activeDomains,
  baselines,
  completedCount,
  totalCount,
  onComplete,
  initialValues,
  initialNotes,
  submitButtonText,
  onCompleted,
  quickCheckInMode = false,
}: CheckInFormProps) {
  const { user, profile } = useAuth();
  const [values, setValues] = useState<Record<DomainType, number>>(
    activeDomains.reduce((acc, domain) => ({ ...acc, [domain]: initialValues?.[domain] ?? 5 }), {} as Record<DomainType, number>),
  );
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updateData: Partial<CheckIn> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: notes || undefined,
        ...values,
      };
      await supabase.from('check_ins').update(updateData).eq('id', checkIn.id);
      trackCheckInCompleted(activeDomains.length);

      if (onCompleted) {
        onCompleted({ ...checkIn, ...updateData });
      } else {
        setDoneCount(completedCount + 1);
        setShowConfirmation(true);
        setTimeout(() => onComplete(), 1500);
      }
    } catch {
      setSaving(false);
    }
  };

  if (showConfirmation) {
    return (
      <View style={styles.confirmationRoot}>
        <View style={styles.confirmationIcon}>
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Path d="M3 8l3.5 3.5L13 5" stroke="#818cf8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <Text style={styles.confirmationLogged}>Logged</Text>
        <Text style={styles.confirmationCount}>
          {doneCount} of {totalCount} done today
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardHeader}>{quickCheckInMode ? 'Quick mind check-in' : 'Now · Mind check-in'}</Text>

          <View style={styles.slidersGroup}>
            {activeDomains.map(domain => (
              <DomainSlider
                key={domain}
                domain={domain}
                label={DOMAIN_COPY[domain].label}
                value={values[domain]}
                baseline={baselines[domain]}
                onChange={value => setValues({ ...values, [domain]: value })}
                color={getDomainColorFromProfile(domain, profile)}
              />
            ))}
          </View>
        </View>

        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>Context</Text>
          <TextInput
            value={notes}
            onChangeText={text => setNotes(text.slice(0, 200))}
            placeholder="Brief context only (optional)"
            placeholderTextColor="#4a5568"
            multiline
            maxLength={200}
            style={styles.notesInput}
          />
          <View style={styles.notesFooter}>
            <Text style={[styles.notesCount, notes.length > 180 && styles.notesCountWarn]}>{notes.length} / 200</Text>
          </View>
        </View>

        <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => pressed && !saving && styles.pressed}>
          <View style={[styles.submitButton, saving && styles.submitButtonDisabled]}>
            {saving ? <ActivityIndicator color="#4a5568" /> : <Text style={styles.submitButtonText}>{submitButtonText ?? 'Done'}</Text>}
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 96 },
  card: {
    backgroundColor: '#1e2840',
    borderWidth: 1,
    borderColor: '#3d4f7a',
    borderRadius: 20,
    padding: 24,
    paddingTop: 28,
    marginBottom: 16,
  },
  cardHeader: { fontSize: 13, color: '#818cf8', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 24 },
  slidersGroup: { gap: 28 },
  notesCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  notesLabel: { fontSize: 13, color: '#718096', marginBottom: 10 },
  notesInput: { color: '#e2e8f0', fontSize: 13, minHeight: 60, textAlignVertical: 'top', padding: 0 },
  notesFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  notesCount: { fontSize: 11, color: '#4a5568' },
  notesCountWarn: { color: '#f6ad55' },
  submitButton: { padding: 14, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#1e2533' },
  submitButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  confirmationRoot: { flex: 1, backgroundColor: '#0a0c12', alignItems: 'center', justifyContent: 'center' },
  confirmationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmationLogged: { fontSize: 15, color: '#a0aec0', marginBottom: 6 },
  confirmationCount: { fontSize: 13, color: '#718096' },
});
