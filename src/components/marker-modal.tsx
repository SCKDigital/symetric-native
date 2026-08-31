import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { dateToString, parseDateString } from '@/lib/date-utils';
import { markerColors, markerTypeLabels, MarkerType } from '@/lib/marker-colors';
import type { CreateMarkerInput, InterventionMarker, MedicationAction } from '@/types/marker';

const MAX_LABEL_LENGTH = 100;

interface MarkerModalProps {
  marker?: InterventionMarker;
  defaultDate?: string;
  onSave: (input: CreateMarkerInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
  /** Gates the cycle_phase marker type — mirrors profile.cycle_tracking_enabled. */
  cycleTrackingEnabled?: boolean;
}

const MEDICATION_ACTIONS: { action: MedicationAction; label: string }[] = [
  { action: 'start', label: 'Started' },
  { action: 'stop', label: 'Stopped' },
  { action: 'increase', label: 'Increased dose' },
  { action: 'decrease', label: 'Decreased dose' },
];

const THERAPY_ACTIONS: { action: MedicationAction; label: string }[] = [
  { action: 'mind', label: 'Mind' },
  { action: 'body', label: 'Body' },
];

// Ported from the web app's MarkerModal.tsx. Same validation rules, same
// auto-prefix-label-on-action-select behavior, same delete-confirmation
// sub-view. Mechanic swap: the date field uses
// @react-native-community/datetimepicker instead of <input type="date">.
export default function MarkerModal({ marker, defaultDate, onSave, onDelete, onClose, cycleTrackingEnabled = false }: MarkerModalProps) {
  const today = dateToString(new Date());
  const isEditing = !!marker;

  const [markerType, setMarkerType] = useState<MarkerType | ''>(marker?.marker_type ?? '');
  const [markerDate, setMarkerDate] = useState(marker?.marker_date ?? defaultDate ?? today);
  const [label, setLabel] = useState(marker?.label ?? '');
  const [selectedAction, setSelectedAction] = useState<MedicationAction | null>(marker?.medication_action ?? null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  // Selecting a sub-type action (medication change / cycle phase / therapy
  // focus) auto-fills the label for new markers only. Ported from the web's
  // effect keyed on `selectedAction`, but applied directly at each selection
  // site instead — an effect reacting to a value this component itself just
  // set is exactly the redundant-derived-state pattern the
  // react-hooks/set-state-in-effect rule targets; a plain event handler is
  // both the fix and the more direct way to say "this selection does two
  // things: set the action, and maybe fill the label."
  const selectAction = (type: MarkerType | '', action: MedicationAction | null) => {
    setSelectedAction(action);
    if (isEditing || !action) return;

    if (type === 'medication') {
      const prefixes: Partial<Record<MedicationAction, string>> = { start: 'Started ', stop: 'Stopped ', increase: 'Increased to ', decrease: 'Decreased to ', other: '' };
      const prefix = prefixes[action];
      if (prefix === undefined) return;
      const otherPrefixes = Object.values(prefixes).filter(p => p !== '');
      setLabel(prev => (prev === '' || otherPrefixes.some(p => prev.startsWith(p!)) ? prefix : prev));
    } else if (type === 'cycle_phase') {
      const cycleLabels: Partial<Record<MedicationAction, string>> = { day_one: 'Day 1' };
      const autoLabel = cycleLabels[action];
      if (autoLabel === undefined) return;
      const existing = Object.values(cycleLabels).filter(Boolean);
      setLabel(prev => (prev === '' || existing.includes(prev) ? autoLabel : prev));
    } else if (type === 'therapy') {
      const therapyLabels: Partial<Record<MedicationAction, string>> = { mind: 'Mind appointment', body: 'Body appointment' };
      const autoLabel = therapyLabels[action];
      if (autoLabel === undefined) return;
      const existing = Object.values(therapyLabels).filter(Boolean);
      setLabel(prev => (prev === '' || existing.includes(prev) ? autoLabel : prev));
    }
  };

  const canSave = markerType !== '' && markerDate !== '' && label.trim().length > 0 && (markerType !== 'cycle_phase' || selectedAction !== null) && (markerType !== 'therapy' || selectedAction !== null);

  const validate = (): boolean => {
    let ok = true;
    setTypeError(null);
    setDateError(null);
    setLabelError(null);

    if (!markerType) {
      setTypeError('Pick a type');
      ok = false;
    }
    if (!markerDate) {
      setDateError('Pick a date');
      ok = false;
    } else if (markerDate > today) {
      setDateError("Date can't be in the future");
      ok = false;
    }
    if (!label.trim()) {
      setLabelError('Add a short description');
      ok = false;
    }
    return ok;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        marker_type: markerType as MarkerType,
        marker_date: markerDate,
        label: label.trim(),
        ...((markerType === 'medication' || markerType === 'cycle_phase' || markerType === 'therapy') && selectedAction ? { medication_action: selectedAction } : {}),
      });
      onClose();
    } catch (e) {
      console.error('[MarkerModal] save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!marker || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(marker.id);
      onClose();
    } catch (e) {
      console.error('[MarkerModal] delete error:', e);
    } finally {
      setDeleting(false);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate) {
      setMarkerDate(dateToString(selectedDate));
      setDateError(null);
    }
  };

  if (confirmDelete) {
    return (
      <Modal transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.confirmCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>Delete this marker?</Text>
            <Text style={styles.confirmBody}>You can always add it back later.</Text>
            <Pressable onPress={handleDelete} disabled={deleting} style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}>
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>Delete marker</Text>}
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(false)} style={styles.cancelTextButton}>
              <Text style={styles.cancelTextButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{isEditing ? 'Edit marker' : 'Add marker'}</Text>

            {/* ── Type selector ─────────────────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.pillGrid}>
                {(Object.keys(markerColors) as MarkerType[])
                  .filter(type => type !== 'cycle_phase' || cycleTrackingEnabled)
                  .map(type => {
                    const selected = markerType === type;
                    const color = markerColors[type];
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          if (type !== markerType) {
                            selectAction(type, type === 'cycle_phase' ? 'day_one' : null);
                          }
                          setMarkerType(type);
                          setTypeError(null);
                        }}
                        style={[styles.pill, styles.pillHalf, { borderColor: selected ? color : '#2d3748' }, selected && { backgroundColor: `${color}33` }]}>
                        <Text style={[styles.pillText, selected && { color, fontWeight: '600' }]}>{markerTypeLabels[type]}</Text>
                      </Pressable>
                    );
                  })}
              </View>
              <Text style={styles.hint}>This helps you see patterns before and after different kinds of changes.</Text>
              {typeError && <Text style={styles.errorText}>{typeError}</Text>}
            </View>

            {/* ── Cycle phase sub-type ──────────────────────────────────── */}
            {markerType === 'cycle_phase' && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Which phase?</Text>
                <Pressable
                  onPress={() => selectAction('cycle_phase', selectedAction === 'day_one' ? null : 'day_one')}
                  style={[styles.pill, { borderColor: selectedAction === 'day_one' ? '#ec4899' : '#2d3748' }, selectedAction === 'day_one' && { backgroundColor: 'rgba(236,72,153,0.13)' }]}>
                  <View style={[styles.dot, { backgroundColor: '#ec4899' }]} />
                  <Text style={[styles.pillText, selectedAction === 'day_one' && { color: '#ec4899', fontWeight: '600' }]}>Day 1</Text>
                </Pressable>
              </View>
            )}

            {/* ── Therapy sub-type ──────────────────────────────────────── */}
            {markerType === 'therapy' && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Mind or body?</Text>
                <View style={styles.pillGrid}>
                  {THERAPY_ACTIONS.map(({ action, label: btnLabel }) => {
                    const active = selectedAction === action;
                    const color = markerColors.therapy;
                    return (
                      <Pressable key={action} onPress={() => selectAction('therapy', active ? null : action)} style={[styles.pill, styles.pillHalf, { borderColor: active ? color : '#2d3748' }, active && { backgroundColor: `${color}22` }]}>
                        <Text style={[styles.pillText, active && { color, fontWeight: '600' }]}>{btnLabel}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Medication action ─────────────────────────────────────── */}
            {markerType === 'medication' && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>What kind of change?</Text>
                <View style={styles.pillGrid}>
                  {MEDICATION_ACTIONS.map(({ action, label: btnLabel }) => {
                    const active = selectedAction === action;
                    return (
                      <Pressable key={action} onPress={() => selectAction('medication', active ? null : action)} style={[styles.pill, styles.pillHalf, { borderColor: active ? '#f59e0b' : '#2d3748' }, active && { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                        <Text style={[styles.pillText, active && { color: '#fbbf24', fontWeight: '600' }]}>{btnLabel}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Date ───────────────────────────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>When?</Text>
              <View style={styles.quickDateRow}>
                {(
                  [
                    { label: 'Today', daysAgo: 0 },
                    { label: '1 week ago', daysAgo: 7 },
                    { label: '2 weeks ago', daysAgo: 14 },
                  ] as const
                ).map(({ label: shortcutLabel, daysAgo }) => {
                  const d = new Date();
                  d.setDate(d.getDate() - daysAgo);
                  const value = dateToString(d);
                  const isSelected = markerDate === value;
                  return (
                    <Pressable
                      key={shortcutLabel}
                      onPress={() => {
                        setMarkerDate(value);
                        setDateError(null);
                      }}
                      style={[styles.quickDatePill, isSelected && styles.quickDatePillActive]}>
                      <Text style={[styles.quickDateText, isSelected && styles.quickDateTextActive]}>{shortcutLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => setShowDatePicker(true)} style={[styles.dateInput, dateError && styles.dateInputError]}>
                <Text style={styles.dateInputText}>{markerDate}</Text>
              </Pressable>
              {showDatePicker && (
                <View style={styles.pickerWrap}>
                  <DateTimePicker value={parseDateString(markerDate)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} maximumDate={new Date()} themeVariant="dark" onChange={handleDateChange} />
                  {Platform.OS === 'ios' && (
                    <Pressable onPress={() => setShowDatePicker(false)} style={styles.pickerDone}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {dateError && <Text style={styles.errorText}>{dateError}</Text>}
            </View>

            {/* ── Label ──────────────────────────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>What changed?</Text>
              <TextInput
                value={label}
                maxLength={MAX_LABEL_LENGTH}
                placeholder={markerType === 'medication' ? 'e.g. Started 20mg, Increased dosage' : markerType === 'therapy' ? 'e.g. First session, Weekly CBT' : 'e.g. Job change, Moved cities'}
                placeholderTextColor="#4a5568"
                onChangeText={text => {
                  setLabel(text);
                  setLabelError(null);
                }}
                style={[styles.textInput, labelError && styles.dateInputError]}
              />
              {label.length >= 80 && (
                <Text style={[styles.charCount, label.length >= 95 && styles.charCountWarn]}>
                  {MAX_LABEL_LENGTH - label.length} character{MAX_LABEL_LENGTH - label.length !== 1 ? 's' : ''} remaining
                </Text>
              )}
              {labelError && <Text style={styles.errorText}>{labelError}</Text>}
            </View>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <View style={styles.actionRow}>
              <Pressable onPress={onClose} disabled={saving} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} disabled={saving || !canSave} style={[styles.saveButton, (saving || !canSave) && styles.saveButtonDisabled]}>
                {saving ? <ActivityIndicator color="#4a5568" /> : <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>Save marker</Text>}
              </Pressable>
            </View>

            {isEditing && onDelete && (
              <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteTextButton}>
                <Text style={styles.deleteTextButtonText}>Delete marker</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,12,18,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: '#141820', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1e2533' },
  title: { fontSize: 18, fontWeight: '700', color: '#e2e8f0', letterSpacing: -0.3, marginBottom: 24 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, color: '#8892a4', marginBottom: 8 },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#2d3748', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  pillHalf: { flexBasis: '48%', flexGrow: 1 },
  pillText: { fontSize: 13, color: '#8892a4', textAlign: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  hint: { fontSize: 12, color: '#4a5568', marginTop: 6 },
  errorText: { fontSize: 13, color: '#f87171', marginTop: 4 },
  quickDateRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  quickDatePill: { flex: 1, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748', backgroundColor: '#0a0c12', alignItems: 'center' },
  quickDatePillActive: { borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)' },
  quickDateText: { fontSize: 12, color: '#8892a4' },
  quickDateTextActive: { color: '#818cf8' },
  dateInput: { padding: 11, paddingHorizontal: 14, backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#1e2533', borderRadius: 10 },
  dateInputError: { borderColor: '#f87171' },
  dateInputText: { fontSize: 15, color: '#e2e8f0' },
  pickerWrap: { marginTop: 10, backgroundColor: '#0a0c12', borderRadius: 10, overflow: 'hidden' },
  pickerDone: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e2533' },
  pickerDoneText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },
  textInput: { padding: 11, paddingHorizontal: 14, backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#1e2533', borderRadius: 10, color: '#e2e8f0', fontSize: 15 },
  charCount: { fontSize: 12, color: '#4a5568', marginTop: 4, textAlign: 'right' },
  charCountWarn: { color: '#f87171' },
  actionRow: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#2d3748', alignItems: 'center' },
  cancelButtonText: { fontSize: 15, color: '#8892a4' },
  saveButton: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: '#6366f1', alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#2d3748' },
  saveButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  saveButtonTextDisabled: { color: '#4a5568' },
  deleteTextButton: { marginTop: 16, padding: 12, alignItems: 'center' },
  deleteTextButtonText: { fontSize: 14, color: '#f87171' },
  confirmCard: { width: '100%', maxWidth: 400, backgroundColor: '#141820', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1e2533' },
  confirmTitle: { fontSize: 16, fontWeight: '600', color: '#e2e8f0', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: '#8892a4', marginBottom: 24, lineHeight: 21 },
  deleteButton: { padding: 14, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center', marginBottom: 8 },
  deleteButtonDisabled: { backgroundColor: '#2d3748' },
  deleteButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  cancelTextButton: { padding: 8, alignItems: 'center' },
  cancelTextButtonText: { fontSize: 14, color: '#8892a4' },
});
