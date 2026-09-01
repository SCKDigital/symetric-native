import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createAppointment, deleteAppointment, updateAppointment } from '@/lib/api/appointments';
import { trackAppointmentCreated } from '@/lib/analytics';
import { parseDateString, todayDateString } from '@/lib/date-utils';
import { useAuth } from '@/contexts/auth-context';
import type { Appointment, AppointmentFocusCategory } from '@/lib/supabase';

import AppointmentModal from './appointment-modal';

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntilLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round((parseDateString(dateStr).getTime() - parseDateString(todayStr).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 0) return `In ${diff} day${diff === 1 ? '' : 's'}`;
  const abs = Math.abs(diff);
  return `${abs} day${abs === 1 ? '' : 's'} ago`;
}

interface Props {
  appointment: Appointment | null;
  onAppointmentChange: () => void;
}

// Ported from the web app's AppointmentContext.tsx. `today` is captured once
// via a lazy initializer (not read directly in the render body) since
// Date.now() during render trips react-hooks/purity.
export default function AppointmentContext({ appointment, onAppointmentChange }: Props) {
  const { user } = useAuth();
  const [today] = useState(() => todayDateString());
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(date: string, focusAreas: string[], focusCategories: AppointmentFocusCategory[]) {
    if (!user) return;
    if (appointment) {
      await updateAppointment(appointment.id, { appointment_date: date, focus_areas: focusAreas, focus_categories: focusCategories });
    } else {
      await createAppointment(user.id, date, focusAreas, focusCategories);
      const daysUntil = Math.round((parseDateString(date).getTime() - parseDateString(today).getTime()) / 86400000);
      trackAppointmentCreated(daysUntil);
    }
    setShowModal(false);
    onAppointmentChange();
  }

  async function handleDelete() {
    if (!appointment) return;
    setDeleting(true);
    try {
      await deleteAppointment(appointment.id);
      setShowDeleteConfirm(false);
      onAppointmentChange();
    } finally {
      setDeleting(false);
    }
  }

  if (!appointment) {
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Set your next appointment</Text>
          <Text style={styles.emptyBody}>Add your appointment date and we&rsquo;ll help you prepare with patterns, questions, and a report.</Text>
          <Pressable onPress={() => setShowModal(true)} style={styles.setButton}>
            <Text style={styles.setButtonText}>Set appointment date</Text>
          </Pressable>
        </View>
        {showModal && <AppointmentModal appointment={null} onSave={handleSave} onClose={() => setShowModal(false)} />}
      </>
    );
  }

  const daysLabel = daysUntilLabel(appointment.appointment_date, today);
  const isPast = appointment.appointment_date < today;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Appointment</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.date}>{fmtDate(appointment.appointment_date)}</Text>
            <Text style={[styles.daysLabel, daysLabel === 'Today' ? styles.daysLabelToday : isPast ? styles.daysLabelPast : null]}>{daysLabel}</Text>
          </View>
          <Pressable onPress={() => setShowModal(true)} hitSlop={8}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>

        {appointment.focus_areas && appointment.focus_areas.length > 0 && (
          <View style={styles.focusBlock}>
            <Text style={styles.focusLabel}>Focus areas</Text>
            <Text style={styles.focusText}>{appointment.focus_areas.join(', ')}</Text>
          </View>
        )}

        {!showDeleteConfirm ? (
          <Pressable onPress={() => setShowDeleteConfirm(true)} style={styles.removeButton}>
            <Text style={styles.removeText}>Remove appointment</Text>
          </Pressable>
        ) : (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmText}>Remove this appointment?</Text>
            <Pressable onPress={handleDelete} disabled={deleting} hitSlop={8}>
              <Text style={styles.confirmYes}>{deleting ? 'Removing…' : 'Yes, remove'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowDeleteConfirm(false)} hitSlop={8}>
              <Text style={styles.confirmCancel}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>

      {showModal && <AppointmentModal appointment={appointment} onSave={handleSave} onClose={() => setShowModal(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#c8d0e0', marginBottom: 6 },
  emptyBody: { fontSize: 13, color: '#6b7a99', lineHeight: 19, marginBottom: 16 },
  setButton: { width: '100%', padding: 12, backgroundColor: '#4f46e5', borderRadius: 10, alignItems: 'center' },
  setButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  date: { fontSize: 16, fontWeight: '500', color: '#e2e8f0', marginBottom: 4 },
  daysLabel: { fontSize: 13, color: '#8892a4' },
  daysLabelToday: { color: '#818cf8', fontWeight: '600' },
  daysLabelPast: { color: '#f87171' },
  editText: { color: '#818cf8', fontSize: 13, fontWeight: '500' },
  focusBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e2533' },
  focusLabel: { fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: '600' },
  focusText: { fontSize: 13, color: '#8892a4' },
  removeButton: { marginTop: 14 },
  removeText: { color: '#2d3748', fontSize: 12 },
  confirmRow: { marginTop: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
  confirmText: { fontSize: 12, color: '#6b7a99' },
  confirmYes: { fontSize: 12, fontWeight: '600', color: '#f87171' },
  confirmCancel: { fontSize: 12, color: '#4a5568' },
});
