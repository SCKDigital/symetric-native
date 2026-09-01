import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BODY_DOMAIN_ORDER, BODY_DOMAINS } from '@/lib/body/constants';
import type { BodyDomainType } from '@/lib/supabase';

// Settings chrome uses the app's default indigo, not the body-tracking
// amber accent — that accent is reserved for the capture screens
// themselves (BodyCheckIn, BodyMap, History) so it reads as a distinct
// experience there. Matches the web app's own CHROME_COLOR convention.
const CHROME_COLOR = '#7b83f0';

function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  activeDomains: BodyDomainType[];
  onToggleDomain: (domain: BodyDomainType) => void;
  currentAvailableFrom: string;
  currentReminderTime: string;
  currentMorningEnabled: boolean;
  currentMorningTime: string;
  onSaveTiming: (availableFrom: string, reminderTime: string, morningEnabled: boolean, morningTime: string) => Promise<void>;
  onClose: () => void;
}

type ActivePicker = 'available' | 'reminder' | 'morning' | null;

// Ported from the web app's BodyTrackingSheet.tsx. Mechanic swap: three
// <input type="time"> fields -> one shared @react-native-community/
// datetimepicker (mode="time", same module + timeStringToDate/
// dateToTimeString helper pattern as onboarding's check-in-preferences-step.tsx),
// tracked by which field is currently being edited. Conditionally mounted
// by its parent (settings.tsx) rather than an always-mounted `visible`
// prop, matching this app's established modal convention.
export default function BodyTrackingSheet({
  activeDomains, onToggleDomain, currentAvailableFrom, currentReminderTime,
  currentMorningEnabled, currentMorningTime, onSaveTiming, onClose,
}: Props) {
  const [availableFrom, setAvailableFrom] = useState(currentAvailableFrom);
  const [reminderTime, setReminderTime] = useState(currentReminderTime);
  const [morningEnabled, setMorningEnabled] = useState(currentMorningEnabled);
  const [morningTime, setMorningTime] = useState(currentMorningTime);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = availableFrom !== currentAvailableFrom
    || reminderTime !== currentReminderTime
    || morningEnabled !== currentMorningEnabled
    || morningTime !== currentMorningTime;

  const handleSave = async () => {
    if (!dirty) { onClose(); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveTiming(availableFrom, reminderTime, morningEnabled, morningTime);
      onClose();
    } catch {
      setSaveError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  const handleTimeChange = (field: Exclude<ActivePicker, null>) => (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setActivePicker(null);
      if (event.type === 'dismissed') return;
    }
    if (!selectedDate) return;
    const value = dateToTimeString(selectedDate);
    if (field === 'available') setAvailableFrom(value);
    else if (field === 'reminder') setReminderTime(value);
    else setMorningTime(value);
  };

  const pickerValue = activePicker === 'available' ? availableFrom : activePicker === 'reminder' ? reminderTime : morningTime;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Body check-in settings</Text>
            <Text style={styles.subtitle}>Deactivating a domain stops new entries but keeps your history.</Text>

            <Text style={styles.sectionLabel}>Domains</Text>
            <View style={styles.pillRow}>
              {BODY_DOMAIN_ORDER.map(d => {
                const config = BODY_DOMAINS[d];
                if (config.deprecated) return null;
                if (config.required) {
                  return (
                    <View key={d} style={styles.requiredPill}>
                      <Text style={styles.requiredPillText}>{config.label}</Text>
                    </View>
                  );
                }
                const active = activeDomains.includes(d);
                return (
                  <Pressable key={d} onPress={() => onToggleDomain(d)} style={[styles.domainPill, active && styles.domainPillActive]}>
                    <Text style={[styles.domainPillText, active && styles.domainPillTextActive]}>{config.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>Check-in opens at</Text>
                <Pressable onPress={() => setActivePicker('available')} style={styles.timeInput}>
                  <Text style={styles.timeInputText}>{availableFrom}</Text>
                </Pressable>
              </View>
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>Remind me at</Text>
                <Pressable onPress={() => setActivePicker('reminder')} style={styles.timeInput}>
                  <Text style={styles.timeInputText}>{reminderTime}</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.timeHint}>
              “Opens at” is when the Today card appears. “Remind me at” is when a single push fires, only if you haven’t logged yet.
            </Text>

            <View style={styles.morningRow}>
              <View style={styles.morningTextWrap}>
                <Text style={styles.morningTitle}>Morning check-in</Text>
                <Text style={styles.morningSubtitle}>
                  Optional and short: three scores (fatigue, pain, standing up) to catch how the day started, kept separate from tonight’s numbers.
                </Text>
              </View>
              <Switch value={morningEnabled} onValueChange={setMorningEnabled} trackColor={{ true: CHROME_COLOR }} />
            </View>
            {morningEnabled && (
              <View style={styles.morningTimeBlock}>
                <Text style={styles.timeLabel}>Morning check-in opens at</Text>
                <Pressable onPress={() => setActivePicker('morning')} style={styles.timeInput}>
                  <Text style={styles.timeInputText}>{morningTime}</Text>
                </Pressable>
              </View>
            )}

            {activePicker && (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={timeStringToDate(pickerValue)}
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

            {saveError && <Text style={styles.errorText}>{saveError}</Text>}

            <Pressable onPress={handleSave} disabled={saving} style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
              <Text style={[styles.saveButtonText, saving && styles.saveButtonTextDisabled]}>{saving ? 'Saving…' : dirty ? 'Save' : 'Done'}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141820', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48, maxHeight: '85%' },
  handle: { width: 36, height: 4, backgroundColor: '#2d3748', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  title: { fontSize: 16, fontWeight: '600', color: '#e2e8f0', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#718096', marginBottom: 22 },
  sectionLabel: { fontSize: 12, color: '#8892a4', marginBottom: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 22 },
  requiredPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: `${CHROME_COLOR}1a`, borderWidth: 1, borderColor: `${CHROME_COLOR}40` },
  requiredPillText: { fontSize: 12, fontWeight: '500', color: CHROME_COLOR },
  domainPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#1e2333', borderWidth: 1, borderColor: '#252b3b' },
  domainPillActive: { backgroundColor: `${CHROME_COLOR}1a`, borderColor: `${CHROME_COLOR}40` },
  domainPillText: { fontSize: 12, fontWeight: '500', color: '#555c72' },
  domainPillTextActive: { color: CHROME_COLOR },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  timeCol: { flex: 1 },
  timeLabel: { fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  timeInput: { padding: 11, paddingHorizontal: 14, backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10 },
  timeInputText: { fontSize: 15, color: '#e2e8f0' },
  timeHint: { fontSize: 11.5, color: '#4a5568', lineHeight: 17, marginBottom: 20 },
  morningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  morningTextWrap: { flex: 1, marginRight: 12 },
  morningTitle: { fontSize: 13, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  morningSubtitle: { fontSize: 11.5, color: '#4a5568', lineHeight: 16 },
  morningTimeBlock: { marginBottom: 20 },
  pickerWrap: { marginBottom: 20, backgroundColor: '#0a0c12', borderRadius: 10, overflow: 'hidden' },
  pickerDone: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e2533' },
  pickerDoneText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 12, color: '#f87171', marginBottom: 16 },
  saveButton: { padding: 14, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#1e2533' },
  saveButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  saveButtonTextDisabled: { color: '#4a5568' },
});
