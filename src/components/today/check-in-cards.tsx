import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CheckIn } from '@/lib/supabase';

// Ports of ActiveCheckInCard, LateCheckInCard and PendingCheckInCard from the
// web app's today/TodayCards.tsx.
//
// Native previously dropped the user straight into the check-in form the
// moment one came due, with no way past it — no snooze, and no sight of the
// rest of Today until it was answered or the app was closed. These are the
// three states the web puts in front of the form instead: due now, due earlier
// and still rescuable, and snoozed.

function minutesLeft(checkIn: CheckIn, nowMs: number): number {
  return Math.floor(Math.max(0, new Date(checkIn.expires_at).getTime() - nowMs) / 60000);
}

function expiresLabel(minutes: number): string {
  return `Expires in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

export function ActiveCheckInCard({ checkIn, nowMs, onStart, onSnooze }: {
  checkIn: CheckIn; nowMs: number; onStart: () => void; onSnooze: () => void;
}) {
  const minutes = minutesLeft(checkIn, nowMs);
  const isUrgent = minutes <= 5;
  return (
    <View style={styles.hero}>
      <View>
        <Text style={styles.eyebrow}>MIND CHECK-IN AVAILABLE</Text>
        <Text style={styles.heroTitle}>Mind check-in</Text>
        <Text style={[styles.heroMeta, isUrgent && styles.heroMetaUrgent]}>
          {minutes === 0 ? 'Expired' : expiresLabel(minutes)}
        </Text>
      </View>
      <View style={styles.heroActions}>
        <Pressable onPress={onStart} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>Log now</Text>
        </Pressable>
        <Pressable onPress={onSnooze} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.snooze}>Snooze 5 min</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LateCheckInCard({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.hero}>
      <View>
        <Text style={styles.eyebrow}>MIND CHECK-IN AVAILABLE</Text>
        <Text style={styles.heroTitle}>Mind check-in from earlier today</Text>
        <Text style={styles.heroMeta}>Still available to complete</Text>
      </View>
      <Pressable onPress={onStart} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
        <Text style={styles.ctaText}>Complete</Text>
      </Pressable>
    </View>
  );
}

/** A check-in the user snoozed rather than dismissed — same visual weight as
 *  the hero cards, because it's still actionable and still time-limited. */
export function PendingCheckInCard({ checkIn, nowMs, isLate, onResume }: {
  checkIn: CheckIn; nowMs: number; isLate: boolean; onResume: () => void;
}) {
  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingText}>
        <Text style={styles.eyebrow}>SNOOZED</Text>
        <Text style={styles.pendingTitle}>Mind check-in</Text>
        <Text style={styles.pendingMeta}>
          {isLate ? 'Still available to complete' : expiresLabel(minutesLeft(checkIn, nowMs))}
        </Text>
      </View>
      <Pressable onPress={onResume} style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
        <Text style={styles.resumeText}>Resume</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  hero: {
    backgroundColor: '#12162b', borderWidth: 1, borderColor: '#3730a3', borderRadius: 24,
    paddingTop: 32, paddingHorizontal: 28, paddingBottom: 28, gap: 28,
  },
  eyebrow: { fontSize: 12, color: '#818cf8', letterSpacing: 1.4, fontWeight: '700', marginBottom: 12 },
  heroTitle: { fontSize: 22, color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.4, marginBottom: 6 },
  heroMeta: { fontSize: 15, color: '#7886a0' },
  heroMetaUrgent: { color: '#f87171', fontWeight: '600' },
  heroActions: { gap: 10 },
  cta: { paddingVertical: 18, borderRadius: 14, backgroundColor: '#4f46e5', alignItems: 'center' },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#ffffff', letterSpacing: -0.2 },
  snooze: { fontSize: 14, fontWeight: '500', color: '#7886a0', textAlign: 'center', paddingVertical: 8 },

  pendingCard: {
    backgroundColor: '#12162b', borderWidth: 1, borderColor: '#3730a3', borderRadius: 24,
    paddingVertical: 24, paddingHorizontal: 28, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  },
  pendingText: { flex: 1 },
  pendingTitle: { fontSize: 17, color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.2 },
  pendingMeta: { fontSize: 13, color: '#7886a0', marginTop: 2 },
  resume: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#4f46e5', flexShrink: 0 },
  resumeText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
