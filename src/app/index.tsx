import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import MindSetup from '@/components/onboarding/mind-setup';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useMindSetupStatus } from '@/hooks/use-mind-setup-status';

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

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <PlaceholderScreen
        title="Today"
        note="Daily check-in form — mind domains, body domains, sleep. Ports the logic from CheckInForm.tsx / MorningBodyCheckIn.tsx / BodyCheckIn.tsx; UI rebuilt against react-native-svg for the body map."
      />
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
