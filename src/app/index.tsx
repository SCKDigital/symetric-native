import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CheckInForm from '@/components/checkin/check-in-form';
import MindSetup from '@/components/onboarding/mind-setup';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useMindSetupStatus } from '@/hooks/use-mind-setup-status';
import { useTodayCheckIns } from '@/hooks/use-today-check-ins';

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
      </SafeAreaView>
    );
  }

  return <TodayHome />;
}

// Deliberately scoped down from the web app's 999-line TodayScreen.tsx: just
// "find the current pending check-in and let it be completed." Not ported —
// separate work, not forgotten: expiring stale pending check-ins, rescue/
// snooze windows, late-check-in handling, editing past check-ins, body
// check-ins, sleep prompts, day summaries, milestones, appointment reminders.
function TodayHome() {
  const { loading, pendingCheckIn, activeDomains, baselines, completedCount, totalCount, nextScheduled, refresh } = useTodayCheckIns();

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

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.setupPrompt}>
        <Text style={styles.setupHeading}>{allDone ? "You're all caught up" : 'Nothing due right now'}</Text>
        <Text style={styles.setupBody}>
          {allDone
            ? `All ${totalCount} check-ins done for today.`
            : nextScheduled
              ? `Next check-in at ${new Date(nextScheduled.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
              : "No check-ins scheduled for today yet — this should resolve shortly."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  setupPrompt: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  setupHeading: { fontSize: 22, fontWeight: '600', color: '#e2e8f0' },
  setupBody: { fontSize: 15, color: '#8892a4', lineHeight: 22 },
  setupButton: { marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center' },
  setupButtonText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  pressed: { opacity: 0.85 },
});
