import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppointmentContext from '@/components/prepare/appointment-context';
import PastAppointmentsSection from '@/components/prepare/past-appointments-section';
import PrepareInfoSheet from '@/components/prepare/prepare-info-sheet';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { fetchUpcomingAppointment } from '@/lib/api/appointments';
import { trackPrepareTabOpened } from '@/lib/analytics';
import type { Appointment } from '@/lib/supabase';

// Chunk 1 of the Prepare tab port (of the web app's PrepareScreen.tsx +
// prepare/*.tsx, ~2,600 lines across 11 sub-components). This chunk covers
// the appointment CRUD core: setting/editing/removing the next appointment,
// and the past-appointments list. NOT ported yet: the date-range control,
// pattern review (should-discuss/notes on detected clusters), the
// auto-generated + custom question list (with priority reordering),
// notable-changes summary, PDF report generation, and the post-appointment
// completion flow — each is its own later chunk. Until then, once an
// appointment is set, a placeholder note stands in for those sections.
export default function PrepareScreen() {
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [pastRefresh, setPastRefresh] = useState(0);

  const loadAppointment = useCallback(async () => {
    if (!user) return;
    if (!loaded) setLoading(true);
    try {
      const appt = await fetchUpcomingAppointment(user.id);
      setAppointment(appt);
      setPastRefresh(n => n + 1);
    } catch (e) {
      console.error('[PrepareScreen] loadAppointment:', e);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [user, loaded]);

  useEffect(() => { trackPrepareTabOpened(); }, []);
  useEffect(() => {
    // See use-history.ts for why this needs the disable comment: load() is a
    // locally-defined async function, and the linter traces into it and
    // flags the eventual setState calls even though they only run after
    // internal awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAppointment();
  }, [loadAppointment]);

  if (loading) return <PulseLoadingScreen />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.heading}>Prepare</Text>
          <Pressable onPress={() => setShowInfo(true)} hitSlop={8}>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </Pressable>
        </View>

        <AppointmentContext appointment={appointment} onAppointmentChange={loadAppointment} />

        {user && <PastAppointmentsSection userId={user.id} refreshKey={pastRefresh} />}

        {appointment ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              Pattern review, your question list, notable changes, and PDF report generation aren&rsquo;t built yet — this screen only covers your appointment so far.
            </Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>Set your next appointment</Text>
            <Text style={styles.emptyBody}>
              Tell Symetric when your next appointment is and it will help you review patterns, prepare questions, and generate a summary to bring with you.
            </Text>
            <Text style={styles.emptyHint}>Tap the card above to get started.</Text>
          </View>
        )}
      </ScrollView>

      <PrepareInfoSheet isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 96 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 26, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.6 },
  infoIcon: { fontSize: 18, color: '#4a5568' },
  placeholderCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  placeholderText: { fontSize: 13, color: '#4a5568', lineHeight: 19 },
  emptyCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 28, paddingHorizontal: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#c8d0e0', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#6b7a99', lineHeight: 22, marginBottom: 20, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#4a5568' },
});
