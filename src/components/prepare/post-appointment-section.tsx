import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { completeAppointment } from '@/lib/api/appointments';
import { fetchQuestionsForAppointment } from '@/lib/api/questions';
import { trackAppointmentCompleted, trackPostAppointmentOutcomeCaptured } from '@/lib/analytics';
import { todayDateString } from '@/lib/date-utils';
import type { Appointment, PrepareQuestion } from '@/lib/supabase';

interface Props {
  appointment: Appointment;
  onComplete: () => void;
}

// Ported from the web app's PostAppointmentSection.tsx. `today` is captured
// once via a lazy initializer rather than read directly in the render body
// (react-hooks/purity), same fix as every other Date.now()/new Date() catch
// in this port.
export default function PostAppointmentSection({ appointment, onComplete }: Props) {
  const [today] = useState(() => todayDateString());
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [completing, setCompleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addressedQuestions, setAddressedQuestions] = useState<PrepareQuestion[]>([]);
  const [allQuestions, setAllQuestions] = useState<PrepareQuestion[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(true);

  const isPast = appointment.appointment_date <= today;

  useEffect(() => {
    if (!isPast) return;
    fetchQuestionsForAppointment(appointment.id)
      .then(qs => {
        setAllQuestions(qs);
        setAddressedQuestions(qs.filter(q => q.is_addressed));
      })
      .catch(console.error)
      .finally(() => setQuestionsLoading(false));
  }, [appointment.id, isPast]);

  if (!isPast) return null;

  async function handleComplete() {
    setCompleting(true);
    try {
      await completeAppointment(appointment.id, notes.trim() || undefined);
      trackAppointmentCompleted(allQuestions.length, addressedQuestions.length);
      trackPostAppointmentOutcomeCaptured();
      onComplete();
    } finally {
      setCompleting(false);
    }
  }

  const unansweredCount = allQuestions.length - addressedQuestions.length;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>After your appointment</Text>
      <Text style={styles.subtitle}>How did it go? Add any notes from the appointment, then mark it as done.</Text>

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes from the appointment - what was discussed, what you'll try, questions to follow up on…"
        placeholderTextColor="#4a5568"
        multiline
        numberOfLines={4}
        style={styles.notesInput}
      />

      {!questionsLoading && allQuestions.length > 0 && (
        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              {addressedQuestions.length} of {allQuestions.length} question{allQuestions.length === 1 ? '' : 's'} addressed
              {unansweredCount > 0 && <Text style={styles.summaryMuted}> · {unansweredCount} not covered</Text>}
            </Text>
            {addressedQuestions.length > 0 && (
              <Pressable onPress={() => setShowArchive(v => !v)} hitSlop={4}>
                <Text style={styles.toggleText}>{showArchive ? 'Hide' : 'Show'}</Text>
              </Pressable>
            )}
          </View>

          {showArchive && addressedQuestions.length > 0 && (
            <View style={styles.archive}>
              <Text style={styles.archiveLabel}>Addressed</Text>
              {addressedQuestions.map(q => (
                <View key={q.id} style={styles.archiveRow}>
                  <Text style={styles.archiveCheck}>✓</Text>
                  <Text style={styles.archiveTextDone}>{q.question_text}</Text>
                </View>
              ))}

              {unansweredCount > 0 && (
                <>
                  <Text style={[styles.archiveLabel, styles.archiveLabelSpaced]}>Not covered</Text>
                  {allQuestions.filter(q => !q.is_addressed).map(q => (
                    <View key={q.id} style={styles.archiveRow}>
                      <View style={styles.archiveEmptyBox} />
                      <Text style={styles.archiveTextPending}>{q.question_text}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>
      )}

      {!confirmOpen ? (
        <Pressable onPress={() => setConfirmOpen(true)} style={styles.markDoneButton}>
          <Text style={styles.markDoneText}>Mark appointment as done</Text>
        </Pressable>
      ) : (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmText}>This will archive the appointment and clear Prepare for your next one.</Text>
          <Pressable onPress={() => setConfirmOpen(false)} hitSlop={4}>
            <Text style={styles.confirmCancel}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleComplete} disabled={completing} style={[styles.doneButton, completing && styles.doneButtonDisabled]}>
            <Text style={[styles.doneButtonText, completing && styles.doneButtonTextDisabled]}>{completing ? 'Saving…' : 'Done'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#2d3748', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#8892a4', lineHeight: 21, marginBottom: 16 },
  notesInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8, padding: 12, paddingHorizontal: 14, color: '#c8d0e0', fontSize: 14, lineHeight: 21, minHeight: 96, textAlignVertical: 'top', marginBottom: 12 },
  summaryBlock: { marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { fontSize: 13, color: '#6b7a99', flex: 1 },
  summaryMuted: { color: '#4a5568' },
  toggleText: { fontSize: 12, color: '#4a5568' },
  archive: { marginTop: 10, padding: 12, backgroundColor: '#0f1117', borderRadius: 8, borderWidth: 1, borderColor: '#1e2533' },
  archiveLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  archiveLabelSpaced: { marginTop: 12 },
  archiveRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  archiveCheck: { color: '#818cf8', fontSize: 12, fontWeight: '700', marginTop: 2 },
  archiveEmptyBox: { width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: '#2d3748', marginTop: 3 },
  archiveTextDone: { flex: 1, fontSize: 13, color: '#8892a4', lineHeight: 19 },
  archiveTextPending: { flex: 1, fontSize: 13, color: '#4a5568', lineHeight: 19 },
  markDoneButton: { paddingVertical: 12, paddingHorizontal: 20, backgroundColor: 'rgba(79,70,229,0.1)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.3)', borderRadius: 10, alignSelf: 'flex-start' },
  markDoneText: { fontSize: 14, fontWeight: '500', color: '#818cf8' },
  confirmRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  confirmText: { flex: 1, fontSize: 13, color: '#8892a4', lineHeight: 18 },
  confirmCancel: { fontSize: 13, color: '#4a5568', padding: 8 },
  doneButton: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#4f46e5', borderRadius: 8 },
  doneButtonDisabled: { backgroundColor: '#2d3748' },
  doneButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  doneButtonTextDisabled: { color: '#6b7a99' },
});
