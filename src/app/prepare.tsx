import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppointmentContext from '@/components/prepare/appointment-context';
import DateRangeControl from '@/components/prepare/date-range-control';
import PastAppointmentsSection from '@/components/prepare/past-appointments-section';
import PatternReviewSection from '@/components/prepare/pattern-review-section';
import PrepareInfoSheet from '@/components/prepare/prepare-info-sheet';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { fetchUpcomingAppointment, fetchAllAppointments } from '@/lib/api/appointments';
import { trackPrepareTabOpened } from '@/lib/analytics';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { addDays, todayDateString } from '@/lib/date-utils';
import { clusterFindings, type PatternFinding } from '@/lib/pattern-findings';
import { defaultRangeForPreset, loadSavedRange, saveRange, type PrepareRange } from '@/lib/prepare-range';
import { fetchMarkers } from '@/lib/queries/markers';
import type { Appointment, DetectedCluster } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

function CollapsedPatternsRow({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <Pressable onPress={onExpand} style={styles.collapsedRow}>
      <View style={styles.collapsedLeft}>
        <Text style={styles.collapsedLabel}>Patterns</Text>
        {count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      <Text style={styles.chevron}>▼</Text>
    </Pressable>
  );
}

// Chunk 2 of the Prepare tab port. Adds the date-range control and pattern
// review (should-discuss checkboxes + notes on detected clusters), on top
// of chunk 1's appointment CRUD core. Findings are cluster-only for now —
// the web app's PrepareScreen also mixes in sleepConnectionFindings, but
// that detector (sleep_symptom_connections weekly cadence) isn't ported to
// native yet, same deferral noted in pattern-findings.ts since Insights
// chunk 1. STILL NOT ported: the auto-generated + custom question list
// (with priority reordering), notable-changes summary, PDF report
// generation, and the post-appointment completion flow — each is its own
// later chunk, standing in behind a placeholder note.
export default function PrepareScreen() {
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [pastRefresh, setPastRefresh] = useState(0);

  const [range, setRange] = useState<PrepareRange>(() => defaultRangeForPreset('30'));
  const [rangeReady, setRangeReady] = useState(false);
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [allClusters, setAllClusters] = useState<DetectedCluster[]>([]);
  const [clustersLoaded, setClustersLoaded] = useState(false);
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
    setPatternsOpen(false);
    if (user) saveRange(user.id, r);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const todayStr = todayDateString();
    const from = addDays(todayStr, -90);
    fetchClustersForDateRange(user.id, from, todayStr)
      .then(data => setAllClusters(data ?? []))
      .catch(console.error)
      .finally(() => setClustersLoaded(true));

    fetchAllAppointments(user.id).then(all => {
      const completed = all.filter(a => a.is_completed).sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
      setLastVisitDate(completed[0]?.appointment_date ?? null);
    }).catch(() => {});

    fetchMarkers().then(setMarkers).catch(() => {});
  }, [user]);

  if (loading) return <PulseLoadingScreen />;

  const rangeClusters = allClusters.filter(c => c.start_date <= range.end && (c.ongoing || !c.end_date || c.end_date >= range.start));
  const findings: PatternFinding[] = clusterFindings(rangeClusters, todayDateString());
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

            {clustersLoaded && (
              patternsOpen ? (
                <View>
                  <PatternReviewSection appointmentId={appointment.id} findings={findings} />
                  <Pressable onPress={() => setPatternsOpen(false)} style={styles.collapseButton}>
                    <Text style={styles.collapseButtonText}>↑ Collapse patterns</Text>
                  </Pressable>
                </View>
              ) : (
                <CollapsedPatternsRow count={findings.length} onExpand={() => setPatternsOpen(true)} />
              )
            )}

            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>
                Your question list, notable changes, and PDF report generation aren&rsquo;t built yet — this screen only covers your appointment and patterns so far.
              </Text>
            </View>
          </>
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
  collapsedRow: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 16, paddingHorizontal: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collapsedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsedLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9 },
  countBadge: { paddingVertical: 1, paddingHorizontal: 6, backgroundColor: 'rgba(129,140,248,0.15)', borderRadius: 20 },
  countBadgeText: { fontSize: 11, fontWeight: '600', color: '#818cf8' },
  chevron: { fontSize: 10, color: '#6b7a99' },
  collapseButton: { paddingVertical: 12, paddingBottom: 16 },
  collapseButtonText: { fontSize: 12, color: '#4a5568' },
  placeholderCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  placeholderText: { fontSize: 13, color: '#4a5568', lineHeight: 19 },
  emptyCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 28, paddingHorizontal: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#c8d0e0', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#6b7a99', lineHeight: 22, marginBottom: 20, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#4a5568' },
});
