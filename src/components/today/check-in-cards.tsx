import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useComfort } from '@/hooks/use-comfort';
import { COMFORT_TOKENS, NORMAL_TOKENS, type ComfortTokens } from '@/lib/comfort-theme';
import type { CheckIn } from '@/lib/supabase';

// Ports of ActiveCheckInCard, LateCheckInCard and PendingCheckInCard from the
// web app's today/TodayCards.tsx.
//
// Native previously dropped the user straight into the check-in form the
// moment one came due, with no way past it — no snooze, and no sight of the
// rest of Today until it was answered or the app was closed. These are the
// three states the web puts in front of the form instead: due now, due earlier
// and still rescuable, and snoozed.
//
// Comfort mode touches all three:
//
//  - The expiry countdown is hidden and the urgent state suppressed. This is
//    PRESENTATION ONLY — expires_at is never rewritten. The 90-minute rescue
//    window (RESCUE_WINDOW_MS) still catches a late completion exactly as it
//    does normally, so hiding the number costs no data. It removes a live,
//    escalating deadline from the screen of someone already overwhelmed.
//  - Accents drop to their quiet variants and type scales up.
//  - An armed comfort window (not the standing preference) adds the one-tap.

function minutesLeft(checkIn: CheckIn, nowMs: number): number {
  return Math.floor(Math.max(0, new Date(checkIn.expires_at).getTime() - nowMs) / 60000);
}

function expiresLabel(minutes: number): string {
  return `Expires in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/** Both sheets are built once at module load rather than per render — the
 *  tokens are two module-level singletons, so there is nothing to recompute. */
const STYLES = { normal: makeStyles(NORMAL_TOKENS), comfort: makeStyles(COMFORT_TOKENS) };

/** The one-tap. Offered only inside an armed comfort window, never as part of
 *  the standing preference: it is a concession to a bad hour, not a permanent
 *  alternative to checking in. */
function AsUsualButton({ onPress, styles }: { onPress: () => void; styles: Styles }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={styles.asUsual}>Nothing unusual today</Text>
    </Pressable>
  );
}

export function ActiveCheckInCard({ checkIn, nowMs, onStart, onSnooze, onLogAsUsual }: {
  checkIn: CheckIn; nowMs: number; onStart: () => void; onSnooze: () => void;
  /** Present only when an armed comfort window is offering the one-tap. */
  onLogAsUsual?: () => void;
}) {
  const { active, reducesDemand } = useComfort();
  const styles = active ? STYLES.comfort : STYLES.normal;
  const minutes = minutesLeft(checkIn, nowMs);
  const isUrgent = !active && minutes <= 5;

  return (
    <View style={styles.hero}>
      <View>
        <Text style={styles.eyebrow}>MIND CHECK-IN AVAILABLE</Text>
        <Text style={styles.heroTitle}>Mind check-in</Text>
        <Text style={[styles.heroMeta, isUrgent && styles.heroMetaUrgent]}>
          {active ? 'Open whenever you are ready' : minutes === 0 ? 'Expired' : expiresLabel(minutes)}
        </Text>
      </View>
      <View style={styles.heroActions}>
        <Pressable onPress={onStart} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>Log now</Text>
        </Pressable>
        {reducesDemand && onLogAsUsual ? <AsUsualButton onPress={onLogAsUsual} styles={styles} /> : null}
        <Pressable onPress={onSnooze} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.snooze}>Snooze 5 min</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LateCheckInCard({ onStart, onLogAsUsual }: {
  onStart: () => void;
  onLogAsUsual?: () => void;
}) {
  const { active, reducesDemand } = useComfort();
  const styles = active ? STYLES.comfort : STYLES.normal;

  return (
    <View style={styles.hero}>
      <View>
        <Text style={styles.eyebrow}>MIND CHECK-IN AVAILABLE</Text>
        <Text style={styles.heroTitle}>Mind check-in from earlier today</Text>
        <Text style={styles.heroMeta}>Still available to complete</Text>
      </View>
      <View style={styles.heroActions}>
        <Pressable onPress={onStart} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>Complete</Text>
        </Pressable>
        {reducesDemand && onLogAsUsual ? <AsUsualButton onPress={onLogAsUsual} styles={styles} /> : null}
      </View>
    </View>
  );
}

/** A check-in the user snoozed rather than dismissed — same visual weight as
 *  the hero cards, because it's still actionable and still time-limited. */
export function PendingCheckInCard({ checkIn, nowMs, isLate, onResume }: {
  checkIn: CheckIn; nowMs: number; isLate: boolean; onResume: () => void;
}) {
  const { active } = useComfort();
  const styles = active ? STYLES.comfort : STYLES.normal;

  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingText}>
        <Text style={styles.eyebrow}>SNOOZED</Text>
        <Text style={styles.pendingTitle}>Mind check-in</Text>
        <Text style={styles.pendingMeta}>
          {active || isLate ? 'Still available to complete' : expiresLabel(minutesLeft(checkIn, nowMs))}
        </Text>
      </View>
      <Pressable onPress={onResume} style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
        <Text style={styles.resumeText}>Resume</Text>
      </Pressable>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: ComfortTokens) {
  return StyleSheet.create({
    pressed: { opacity: 0.85 },

    hero: {
      backgroundColor: '#12162b', borderWidth: 1, borderColor: t.accentBorder, borderRadius: 24,
      paddingTop: 32, paddingHorizontal: 28, paddingBottom: 28, gap: 28,
    },
    eyebrow: { fontSize: t.fs(12), color: t.accentText, letterSpacing: 1.4, fontWeight: '700', marginBottom: 12 },
    heroTitle: { fontSize: t.fs(22), color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.4, marginBottom: 6 },
    heroMeta: { fontSize: t.fs(15), color: '#7886a0' },
    heroMetaUrgent: { color: '#f87171', fontWeight: '600' },
    heroActions: { gap: 10 },
    cta: { paddingVertical: 18, borderRadius: 14, backgroundColor: t.accent, alignItems: 'center' },
    ctaText: { fontSize: t.fs(17), fontWeight: '700', color: '#ffffff', letterSpacing: -0.2 },
    snooze: { fontSize: t.fs(14), fontWeight: '500', color: '#7886a0', textAlign: 'center', paddingVertical: 8 },
    asUsual: {
      fontSize: t.fs(15), fontWeight: '600', color: '#cbd5e0', textAlign: 'center',
      paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: t.accentBorder,
    },

    pendingCard: {
      backgroundColor: '#12162b', borderWidth: 1, borderColor: t.accentBorder, borderRadius: 24,
      paddingVertical: 24, paddingHorizontal: 28, marginBottom: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    },
    pendingText: { flex: 1 },
    pendingTitle: { fontSize: t.fs(17), color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.2 },
    pendingMeta: { fontSize: t.fs(13), color: '#7886a0', marginTop: 2 },
    resume: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: t.accent, flexShrink: 0 },
    resumeText: { fontSize: t.fs(14), fontWeight: '700', color: '#ffffff' },
  });
}
