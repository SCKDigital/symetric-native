import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import DomainSlider from '@/components/checkin/domain-slider';
import { useAuth } from '@/contexts/auth-context';
import { DOMAIN_COPY, getDomainColorFromProfile } from '@/lib/domains';
import { CheckIn, DomainType, supabase } from '@/lib/supabase';

// Port of the web app's EditCheckInModal.tsx — correcting a check-in inside
// the ten-minute window. Note what it does NOT write: completed_at stays
// untouched, so editing never extends the window it was opened from.

interface Props {
  checkIn: CheckIn;
  activeDomains: DomainType[];
  baselines: Record<DomainType, number>;
  onClose: () => void;
  onSaved: (updated: CheckIn) => void;
}

export default function EditCheckInModal({ checkIn, activeDomains, baselines, onClose, onSaved }: Props) {
  const { profile } = useAuth();

  // Only domains this check-in actually recorded. `activeDomains` is what's
  // tracked *today* — a domain added to tracking after this check-in happened
  // has no value here, and defaulting it would invent data that was never
  // reported for that moment.
  const editableDomains = activeDomains.filter(d => checkIn[d] != null);

  const [values, setValues] = useState<Record<DomainType, number>>(
    editableDomains.reduce((acc, d) => ({ ...acc, [d]: checkIn[d]! }), {} as Record<DomainType, number>),
  );
  const [notes, setNotes] = useState(checkIn.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updates: Partial<CheckIn> = {
        ...values,
        notes: notes || undefined,
        edited_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('check_ins').update(updates).eq('id', checkIn.id);
      if (error) {
        console.error('[EditCheckInModal] save error:', error);
        setSaveError("Couldn't save changes. Check your connection and try again.");
        setSaving(false);
        return;
      }
      onSaved({ ...checkIn, ...updates });
    } catch (e) {
      console.error('[EditCheckInModal] save threw:', e);
      setSaveError("Couldn't save changes. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>EDIT CHECK-IN</Text>
          <Text style={styles.heading}>Change what you logged</Text>

          {editableDomains.map(d => (
            <DomainSlider
              key={d}
              domain={d}
              label={DOMAIN_COPY[d]?.label ?? d}
              value={values[d]}
              baseline={baselines[d]}
              touched
              color={getDomainColorFromProfile(d, profile)}
              onChange={v => setValues(prev => ({ ...prev, [d]: v }))}
            />
          ))}

          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth noting? (optional)"
            placeholderTextColor="#4a5568"
            multiline
            style={styles.notes}
          />

          {saveError && <Text style={styles.error}>{saveError}</Text>}

          <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [styles.submit, pressed && styles.pressed]}>
            <Text style={styles.submitText}>{saving ? 'Saving...' : 'Save changes'}</Text>
          </Pressable>
          <Pressable onPress={onClose} disabled={saving}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  sheet: { flex: 1, backgroundColor: '#0a0c12' },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60, gap: 8 },
  label: { fontSize: 11, color: '#818cf8', fontWeight: '600', letterSpacing: 0.9 },
  heading: { fontSize: 22, fontWeight: '600', color: '#e2e8f0', marginBottom: 12 },
  notes: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#cbd5e0', minHeight: 80, marginTop: 12,
    textAlignVertical: 'top',
  },
  error: { fontSize: 13, color: '#f87171', marginTop: 10 },
  submit: { marginTop: 20, backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  cancel: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 14 },
});
