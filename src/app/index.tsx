import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CheckInForm from '@/components/checkin/check-in-form';
import EditCheckInModal from '@/components/checkin/edit-check-in-modal';
import MarkerModal from '@/components/marker-modal';
import MindSetup from '@/components/onboarding/mind-setup';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import AppLogoHeader from '@/components/shared/app-logo-header';
import { BodyCheckInCard, MorningBodyCheckInCard } from '@/components/today/body-check-in-cards';
import BonusCheckInCard from '@/components/today/bonus-check-in-card';
import { RescheduleListSheet, RescheduleTimePickerSheet } from '@/components/today/reschedule-sheets';
import SleepCard from '@/components/today/sleep-card';
import { useAuth } from '@/contexts/auth-context';
import { useMindSetupStatus } from '@/hooks/use-mind-setup-status';
import { useTodayCheckIns } from '@/hooks/use-today-check-ins';
import { getMinutesRemaining, isWithinEditWindow, wasRecentlyCompleted } from '@/lib/edit-window';
import { createMarker } from '@/lib/queries/markers';
import { CHECK_IN_EXPIRY_MINUTES } from '@/lib/constants';
import { formatTime } from '@/lib/time-format';
import { supabase, type CheckIn } from '@/lib/supabase';

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}

export default function TodayScreen() {
  const { mindSetupComplete, markComplete } = useMindSetupStatus();
  const [showMindSetup, setShowMindSetup] = useState(false);

  if (mindSetupComplete === undefined) return <PulseLoadingScreen />;

  if (showMindSetup) {
    return (
      <MindSetup
        onSetupComplete={() => {
          markComplete();
          setShowMindSetup(false);
        }}
      />
    );
  }

  if (!mindSetupComplete) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.staticPage}>
          <AppLogoHeader trailing={<Text style={styles.date}>{formatDate()}</Text>} />
          <View style={styles.setupPrompt}>
            <Text style={styles.setupHeading}>Set up Mind tracking</Text>
            <Text style={styles.setupBody}>
              Pick the domains you want to track, answer a few baseline questions, and choose when check-ins should
              happen — takes about two minutes.
            </Text>
            <Pressable onPress={() => setShowMindSetup(true)} style={({ pressed }) => [styles.setupButton, pressed && styles.pressed]}>
              <Text style={styles.setupButtonText}>Get started</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return <TodayHome />;
}

// The homescreen the web app's TodayScreen.tsx renders when nothing is due:
// header, "+ Add an event", the sleep card, the next-check-in block, the
// ten-minute edit affordance and the bonus check-in row. This was previously a
// single centred "Nothing due right now" paragraph and nothing else, so there
// was no way to log sleep, add an event, correct a check-in, or add an
// unscheduled one from the app at all.
//
// Still not ported from the web screen, roughly in order of how much they
// matter: rescue/snooze windows and the late-check-in card, the info sheet,
// day summaries, milestones, gap recovery, notification prompts, and the
// appointment reminder card.
function TodayHome() {
  const { profile } = useAuth();
  const {
    loading, pendingCheckIn, activeDomains, baselines, completedCount, totalCount,
    nextScheduled, afterNextScheduled, lastCompleted, timeFormat, allCheckIns, checkInSettings, refresh,
  } = useTodayCheckIns();
  const [editingCheckIn, setEditingCheckIn] = useState<CheckIn | null>(null);
  const [showMarkerModal, setShowMarkerModal] = useState(false);
  const [markerError, setMarkerError] = useState<string | null>(null);
  const [showRescheduleList, setShowRescheduleList] = useState(false);
  const [reschedulingCheckIn, setReschedulingCheckIn] = useState<CheckIn | null>(null);

  if (loading) return <PulseLoadingScreen />;

  if (pendingCheckIn) {
    return (
      <CheckInForm
        checkIn={pendingCheckIn}
        activeDomains={activeDomains}
        baselines={baselines}
        completedCount={completedCount}
        totalCount={totalCount}
        onComplete={refresh}
      />
    );
  }

  const allDone = totalCount > 0 && completedCount === totalCount;
  const lastCompletedAt = lastCompleted?.completed_at ?? null;
  const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Moves one check-in. notified_at is cleared so the reminder fires again at
  // the new time rather than counting as already sent, and scheduled_date is
  // recomputed in the user's zone because a late-evening move can cross
  // midnight in UTC while still being the same local day.
  const handleReschedule = async (target: CheckIn, newTimeIso: string) => {
    const newScheduledAt = new Date(newTimeIso);
    const { error } = await supabase.from('check_ins').update({
      scheduled_at: newTimeIso,
      expires_at: new Date(newScheduledAt.getTime() + CHECK_IN_EXPIRY_MINUTES * 60_000).toISOString(),
      scheduled_date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(newScheduledAt),
      rescheduled_at: new Date().toISOString(),
      notified_at: null,
    }).eq('id', target.id);
    if (error) console.error('[Today] reschedule error:', error);
    setReschedulingCheckIn(null);
    refresh();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <AppLogoHeader trailing={<Text style={styles.date}>{formatDate()}</Text>} />

        {/* Logging a past event, not a today-task — kept first and full width so
            it reads as a persistent utility rather than buried content. */}
        <Pressable
          onPress={() => { setMarkerError(null); setShowMarkerModal(true); }}
          style={({ pressed }) => [styles.addEvent, pressed && styles.pressed]}>
          <Text style={styles.addEventText}>+ Add an event</Text>
        </Pressable>
        {markerError && <Text style={styles.error}>{markerError}</Text>}

        <SleepCard onLogged={refresh} />

        <View style={styles.statusBlock}>
          {allDone ? (
            <>
              <Text style={styles.statusHeading}>All done for today</Text>
              <Text style={styles.statusBody}>See you tomorrow</Text>
            </>
          ) : nextScheduled ? (
            <>
              <Text style={styles.nextLabel}>NEXT MIND CHECK-IN</Text>
              <Text style={styles.nextTime}>{formatTime(nextScheduled.scheduled_at, timeFormat)}</Text>
              {afterNextScheduled && (
                <Text style={styles.nextThen}>then {formatTime(afterNextScheduled.scheduled_at, timeFormat)}</Text>
              )}
              {checkInSettings && (
                <Pressable onPress={() => setShowRescheduleList(true)} style={({ pressed }) => pressed && styles.pressed}>
                  <Text style={styles.reschedule}>Reschedule</Text>
                </Pressable>
              )}
            </>
          ) : totalCount === 0 ? (
            <>
              <Text style={styles.statusHeading}>Your mind check-ins are coming</Text>
              <Text style={styles.statusBody}>
                Nothing is scheduled for today yet — this should resolve shortly.
              </Text>
            </>
          ) : (
            <Text style={styles.statusBody}>Your mind check-in window has closed for today</Text>
          )}
        </View>

        {lastCompletedAt && isWithinEditWindow(lastCompletedAt) && (
          <Pressable
            onPress={() => setEditingCheckIn(lastCompleted)}
            accessibilityRole="button"
            accessibilityLabel={`Edit last check-in, ${getMinutesRemaining(lastCompletedAt)} minutes remaining`}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
            <Text style={styles.editButtonText}>Edit last check-in</Text>
            <Text style={styles.editButtonMeta}>{getMinutesRemaining(lastCompletedAt)} min remaining</Text>
          </Pressable>
        )}

        {lastCompletedAt && wasRecentlyCompleted(lastCompletedAt) && (
          <Text style={styles.windowClosed}>(Editing window closed)</Text>
        )}

        <BonusCheckInCard activeDomains={activeDomains} onLogged={refresh} />

        {/* Body logging, in the web app's own order: the optional morning
            prompt, then the evening card. Both were only reachable from
            Settings here until the Settings rebuild moved them out. */}
        <MorningBodyCheckInCard />
        <BodyCheckInCard />
      </ScrollView>

      {showMarkerModal && (
        <MarkerModal
          onSave={async input => {
            try {
              await createMarker(input);
              refresh();
            } catch (e) {
              console.error('[Today] createMarker error:', e);
              setMarkerError("Couldn't save that event. Check your connection and try again.");
            }
          }}
          onClose={() => setShowMarkerModal(false)}
          cycleTrackingEnabled={profile?.cycle_tracking_enabled ?? false}
        />
      )}

      {showRescheduleList && checkInSettings && (
        <RescheduleListSheet
          allCheckIns={allCheckIns}
          timeFormat={timeFormat}
          onSelect={ci => { setShowRescheduleList(false); setReschedulingCheckIn(ci); }}
          onClose={() => setShowRescheduleList(false)}
        />
      )}

      {reschedulingCheckIn && checkInSettings && (
        <RescheduleTimePickerSheet
          checkIn={reschedulingCheckIn}
          settings={checkInSettings}
          allCheckIns={allCheckIns}
          timeFormat={timeFormat}
          timezone={timezone}
          onConfirm={newTime => handleReschedule(reschedulingCheckIn, newTime)}
          onBack={() => { setReschedulingCheckIn(null); setShowRescheduleList(true); }}
          onClose={() => setReschedulingCheckIn(null)}
        />
      )}

      {editingCheckIn && (
        <EditCheckInModal
          checkIn={editingCheckIn}
          activeDomains={activeDomains}
          baselines={baselines}
          onClose={() => setEditingCheckIn(null)}
          onSaved={() => { setEditingCheckIn(null); refresh(); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  page: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 60 },
  staticPage: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  pressed: { opacity: 0.7 },
  date: { fontSize: 12, color: '#8892a4', letterSpacing: 0.5 },

  addEvent: {
    borderWidth: 1, borderColor: 'rgba(165,180,252,0.25)', borderRadius: 8,
    paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', marginBottom: 20,
  },
  addEventText: { fontSize: 13, fontWeight: '500', color: '#a5b4fc' },
  error: { fontSize: 13, color: '#f87171', marginBottom: 12 },

  statusBlock: { paddingTop: 12, marginBottom: 24 },
  nextLabel: { fontSize: 13, color: '#b0b8c8', letterSpacing: 1, marginBottom: 6 },
  nextTime: { fontSize: 32, fontWeight: '700', color: '#dde4f0', letterSpacing: -1 },
  nextThen: { fontSize: 14, color: '#8892a4', marginTop: 4 },
  reschedule: { fontSize: 13, color: '#4a5568', paddingTop: 10 },
  statusHeading: { fontSize: 20, fontWeight: '600', color: '#c8d0e0', marginBottom: 6 },
  statusBody: { fontSize: 15, color: '#b0b8c8', lineHeight: 22 },

  editButton: {
    backgroundColor: 'rgba(99,102,241,0.06)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  editButtonText: { fontSize: 13, color: '#818cf8' },
  editButtonMeta: { fontSize: 11, color: '#4a5568' },
  windowClosed: { fontSize: 12, color: '#4a5568', marginBottom: 16 },

  setupPrompt: { flex: 1, justifyContent: 'center', gap: 16 },
  setupHeading: { fontSize: 22, fontWeight: '600', color: '#e2e8f0' },
  setupBody: { fontSize: 15, color: '#8892a4', lineHeight: 22 },
  setupButton: { marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center' },
  setupButtonText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
