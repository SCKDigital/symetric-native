import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { completeAppointment } from '@/lib/api/appointments';
import { trackPostAppointmentOutcomeCaptured } from '@/lib/analytics';
import { addDays, parseDateString } from '@/lib/date-utils';
import type { Appointment } from '@/lib/supabase';
import { brandTint } from '@/constants/brand';
import { makeAccentStyles } from '@/lib/accent-styles';

// The day after an appointment, Today asks how it went: the same notes and
// "mark as done" as Prepare's After your appointment card, brought to the
// screen people actually open. It shows on that one day only. "Not required"
// hides it for good (on this device) and leaves the appointment as it is, so
// it can still be finished from Prepare.

const dismissedKey = (userId: string) => `appointment_follow_up_dismissed_${userId}`;

async function loadDismissed(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(dismissedKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function dismiss(userId: string, appointmentId: string): Promise<void> {
  const ids = await loadDismissed(userId);
  if (ids.includes(appointmentId)) return;
  try {
    // Only the latest few matter: an appointment is due a card for one day.
    await AsyncStorage.setItem(dismissedKey(userId), JSON.stringify([...ids, appointmentId].slice(-20)));
  } catch {
    // ignore: at worst the card shows again until the day is over
  }
}

/** The appointment that was yesterday and still wants a follow-up, if any. */
export async function findFollowUpAppointment(
  userId: string,
  appointments: Appointment[],
  today: string,
): Promise<Appointment | null> {
  const yesterday = addDays(today, -1);
  const candidates = appointments.filter(a => !a.is_completed && a.appointment_date === yesterday);
  if (candidates.length === 0) return null;
  const dismissed = await loadDismissed(userId);
  return candidates.find(a => !dismissed.includes(a.id)) ?? null;
}

/** "mind", "body", "mind and body", or "" when it has neither. */
function appointmentKind(a: Appointment): string {
  const cats = a.focus_categories ?? ['mind'];
  const mind = cats.includes('mind');
  const body = cats.includes('body');
  if (mind && body) return 'mind and body';
  if (body) return 'body';
  if (mind) return 'mind';
  return '';
}

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface Props {
  userId: string;
  appointment: Appointment;
  /** Called once the card is finished with, either way. */
  onClose: () => void;
}

export default function AppointmentFollowUpCard({ userId, appointment, onClose }: Props) {
  const styles = useStyles();
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = appointmentKind(appointment);
  const title = kind ? `How did your ${kind} appointment go?` : 'How did your appointment go?';
  const focus = appointment.focus_areas?.length ? appointment.focus_areas.join(', ') : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await completeAppointment(appointment.id, notes.trim() || undefined);
      trackPostAppointmentOutcomeCaptured();
      onClose();
    } catch (e) {
      console.error('[AppointmentFollowUpCard]', e);
      setError("Couldn't save that. Try again, or finish it from Prepare.");
    } finally {
      setSaving(false);
    }
  }

  async function handleNotRequired() {
    await dismiss(userId, appointment.id);
    onClose();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>Yesterday, {fmtDate(appointment.appointment_date)}{focus ? ` · ${focus}` : ''}</Text>

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="What was discussed, what you'll try, questions to follow up on…"
        placeholderTextColor="#4a5568"
        multiline
        numberOfLines={4}
        style={styles.notesInput}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, saving && styles.saveButtonDisabled, pressed && styles.pressed]}>
          <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>{saving ? 'Saving…' : 'Save and mark as done'}</Text>
        </Pressable>
        <Pressable onPress={handleNotRequired} disabled={saving} hitSlop={6} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.notRequired}>Not required</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeAccentStyles(b => ({
  card: {
    backgroundColor: brandTint(b.fill, 0.07),
    borderWidth: 1,
    borderColor: brandTint(b.fill, 0.2),
    borderLeftWidth: 3,
    borderLeftColor: b.text,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pressed: { opacity: 0.7 },
  title: { fontSize: 15, fontWeight: '600', color: '#e2e8f0', marginBottom: 4 },
  meta: { fontSize: 13, color: '#8892a4', marginBottom: 12 },
  notesInput: {
    backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8,
    padding: 12, paddingHorizontal: 14, color: '#c8d0e0', fontSize: 14, lineHeight: 21,
    minHeight: 88, textAlignVertical: 'top', marginBottom: 12,
  },
  error: { fontSize: 13, color: '#f87171', marginBottom: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  saveButton: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: b.fill, borderRadius: 8 },
  saveButtonDisabled: { backgroundColor: '#2d3748' },
  saveText: { fontSize: 14, fontWeight: '600', color: b.onFill },
  saveTextDisabled: { color: '#6b7a99' },
  notRequired: { fontSize: 13, color: '#6b7a99', padding: 6 },
}));
