import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CheckIcon } from '@/components/marker-icons';
import { addDays, dateToString, parseDateString, todayDateString } from '@/lib/date-utils';
import type { Appointment, AppointmentFocusCategory } from '@/lib/supabase';

interface Props {
  appointment: Appointment | null;
  onSave: (date: string, focusAreas: string[], focusCategories: AppointmentFocusCategory[]) => Promise<void>;
  onClose: () => void;
}

function CategoryBubble({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.bubble, active && styles.bubbleActive]}>
      {active && <CheckIcon size={12} color="#818cf8" />}
      <Text style={[styles.bubbleText, active && styles.bubbleTextActive]}>{label}</Text>
    </Pressable>
  );
}

// Ported from the web app's AppointmentModal.tsx. Mechanic swaps: the date
// field uses @react-native-community/datetimepicker instead of
// <input type="date">, and the sheet is a bottom-anchored RN Modal instead
// of a fixed-position overlay div. The web version resets its form fields
// via an effect keyed on a `visible` prop toggling on an always-mounted
// component; here the parent conditionally mounts this component instead
// (matching MarkerModal's `{showModal && <MarkerModal .../>}` convention
// elsewhere in this app), so the form state's useState initializers just
// read the initial props directly and no reset effect is needed.
export default function AppointmentModal({ appointment, onSave, onClose }: Props) {
  // today() reads the clock, so it's captured once via a lazy initializer
  // rather than called directly in the render body (react-hooks/purity).
  const [today] = useState(() => todayDateString());
  const [date, setDate] = useState(() => appointment?.appointment_date ?? addDays(today, 7));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [focusAreasText, setFocusAreasText] = useState(() => appointment?.focus_areas?.join(', ') ?? '');
  const [focusCategories, setFocusCategories] = useState<AppointmentFocusCategory[]>(() => (appointment?.focus_categories?.length ? appointment.focus_categories : ['mind']));
  const [saving, setSaving] = useState(false);

  function toggleCategory(category: AppointmentFocusCategory) {
    setFocusCategories(prev => {
      if (prev.includes(category)) {
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== category);
      }
      return [...prev, category];
    });
  }

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      const focusAreas = focusAreasText.split(',').map(s => s.trim()).filter(Boolean);
      await onSave(date, focusAreas, focusCategories);
    } catch (err) {
      console.error('[AppointmentModal] save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate) setDate(dateToString(selectedDate));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.title}>{appointment ? 'Edit appointment' : 'Set appointment'}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateInput}>
                <Text style={styles.dateInputText}>{date}</Text>
              </Pressable>
              {showDatePicker && (
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={parseDateString(date)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={parseDateString(today)}
                    themeVariant="dark"
                    onChange={handleDateChange}
                  />
                  {Platform.OS === 'ios' && (
                    <Pressable onPress={() => setShowDatePicker(false)} style={styles.pickerDone}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>What&rsquo;s this appointment about?</Text>
              <View style={styles.bubbleRow}>
                <CategoryBubble label="Mind" active={focusCategories.includes('mind')} onPress={() => toggleCategory('mind')} />
                <CategoryBubble label="Body" active={focusCategories.includes('body')} onPress={() => toggleCategory('body')} />
              </View>
            </View>

            <View style={styles.field}>
              <View style={styles.focusLabelRow}>
                <Text style={styles.fieldLabel}>Focus areas</Text>
                <Text style={styles.optionalText}>optional</Text>
              </View>
              <Text style={styles.hint}>Comma-separated - e.g. &ldquo;Sleep patterns, Concentration&rdquo;</Text>
              <TextInput
                value={focusAreasText}
                onChangeText={setFocusAreasText}
                placeholder="What do you want to focus on?"
                placeholderTextColor="#4a5568"
                multiline
                numberOfLines={2}
                style={styles.textArea}
              />
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} disabled={!date || saving} style={[styles.saveButton, (!date || saving) && styles.saveButtonDisabled]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141820', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#1e2533', borderBottomWidth: 0, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  handle: { width: 32, height: 3, backgroundColor: '#2d3748', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 18, fontWeight: '600', color: '#e2e8f0' },
  closeText: { color: '#4a5568', fontSize: 18 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: '#8892a4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  dateInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#1e2533', borderRadius: 10, padding: 12, paddingHorizontal: 14 },
  dateInputText: { fontSize: 15, color: '#e2e8f0' },
  pickerWrap: { marginTop: 10, backgroundColor: '#0a0c12', borderRadius: 10, overflow: 'hidden' },
  pickerDone: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e2533' },
  pickerDoneText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },
  bubbleRow: { flexDirection: 'row', gap: 8 },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5, borderColor: '#2d3748' },
  bubbleActive: { borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.15)' },
  bubbleText: { fontSize: 13, color: '#8892a4' },
  bubbleTextActive: { color: '#818cf8', fontWeight: '600' },
  focusLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  optionalText: { fontSize: 12, fontWeight: '400', color: '#4a5568', textTransform: 'none' },
  hint: { fontSize: 12, color: '#4a5568', marginBottom: 8 },
  textArea: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#1e2533', borderRadius: 10, padding: 12, paddingHorizontal: 14, color: '#e2e8f0', fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#1e2533', alignItems: 'center' },
  cancelButtonText: { fontSize: 15, fontWeight: '500', color: '#8892a4' },
  saveButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#2d3748' },
  saveButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
