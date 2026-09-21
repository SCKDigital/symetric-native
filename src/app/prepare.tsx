import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Rect } from 'react-native-svg';

import AppointmentContext from '@/components/prepare/appointment-context';
import DateRangeControl from '@/components/prepare/date-range-control';
import GenerateReportSection from '@/components/prepare/generate-report-section';
import PastAppointmentsSection from '@/components/prepare/past-appointments-section';
import PostAppointmentSection from '@/components/prepare/post-appointment-section';
import PrepareInfoSheet from '@/components/prepare/prepare-info-sheet';
import QuestionsSection from '@/components/prepare/questions-section';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { fetchUpcomingAppointment, fetchAllAppointments } from '@/lib/api/appointments';
import { trackPrepareTabOpened } from '@/lib/analytics';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { addDays, todayDateString } from '@/lib/date-utils';
import { defaultRangeForPreset, loadSavedRange, saveRange, type PrepareRange } from '@/lib/prepare-range';
import { fetchMarkers } from '@/lib/queries/markers';
import type { Appointment, DetectedCluster } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';
import { makeAccentStyles } from '@/lib/accent-styles';
import { useAccent } from '@/contexts/accent-context';


// Chunk 6 of the Prepare tab port — every sub-component is now wired,
// including PDF report generation (chunk 1 of that sub-feature's own
// multi-chunk port: Page 1/Executive Summary only so far, see
// generate-report.ts's header comment for what's deferred to later report
// chunks). Findings passed to PatternReviewSection are cluster-only — the
// web app's PrepareScreen also mixes in sleepConnectionFindings, but that
// detector (sleep_symptom_connections weekly cadence) isn't ported to
// native yet, same deferral noted in pattern-findings.ts since Insights
// chunk 1.
export default function PrepareScreen() {
  const styles = useStyles();
  const accent = useAccent();
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [pastRefresh, setPastRefresh] = useState(0);

  const [range, setRange] = useState<PrepareRange>(() => defaultRangeForPreset('30'));
  const [rangeReady, setRangeReady] = useState(false);
  const [allClusters, setAllClusters] = useState<DetectedCluster[]>([]);
  const [lastVisitDate, setLastVisitDate] = useState<string | null>(null);
  const [markers, setMarkers] = useState<InterventionMarker[]>([]);

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

  useEffect(() => {
    if (!user) return;
    loadSavedRange(user.id).then(saved => {
      setRange(saved);
      setRangeReady(true);
    });
  }, [user]);

  const handleRangeChange = useCallback((r: PrepareRange) => {
    setRange(r);
    if (user) saveRange(user.id, r);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const todayStr = todayDateString();
    const from = addDays(todayStr, -90);
    fetchClustersForDateRange(user.id, from, todayStr)
      .then(data => setAllClusters(data ?? []))
      .catch(console.error);

    fetchAllAppointments(user.id).then(all => {
      const completed = all.filter(a => a.is_completed).sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
      setLastVisitDate(completed[0]?.appointment_date ?? null);
    }).catch(() => {});

    fetchMarkers().then(setMarkers).catch(() => {});
  }, [user]);

  if (loading) return <PulseLoadingScreen />;

  const rangeClusters = allClusters.filter(c => c.start_date <= range.end && (c.ongoing || !c.end_date || c.end_date >= range.start));
  const mostRecentMarker = [...markers].sort((a, b) => b.marker_date.localeCompare(a.marker_date))[0] ?? null;

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
          <>
            {rangeReady && (
              <DateRangeControl range={range} onChange={handleRangeChange} lastVisitDate={lastVisitDate} mostRecentMarker={mostRecentMarker} />
            )}

            <QuestionsSection appointmentId={appointment.id} />

            <GenerateReportSection clusters={rangeClusters} appointmentId={appointment.id} fromDate={range.start} toDate={range.end} />

            <PostAppointmentSection appointment={appointment} onComplete={loadAppointment} />
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Svg width={32} height={32} viewBox="0 0 16 16" fill="none" stroke={accent.textFlat}
              strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={styles.emptyIcon}>
              <Rect x={2} y={3} width={12} height={11} rx={1.5} />
              <Line x1={2} y1={7} x2={14} y2={7} />
              <Line x1={5} y1={1} x2={5} y2={4} />
              <Line x1={11} y1={1} x2={11} y2={4} />
              <Line x1={6} y1={10.5} x2={10} y2={10.5} />
            </Svg>
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

const useStyles = makeAccentStyles(b => ({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 96 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 26, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.6 },
  infoIcon: { fontSize: 18, color: '#4a5568' },
  emptyCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 28, paddingHorizontal: 24, alignItems: 'center' },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#c8d0e0', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#6b7a99', lineHeight: 22, marginBottom: 20, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#4a5568' },
}));
