import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { SheetCancel, SheetShell } from '@/components/settings/settings-primitives';
import type { Comfort, ComfortDuration } from '@/hooks/use-comfort';
import { formatTime, type TimeFormat } from '@/lib/time-format';

// Comfort mode's entry point lives on Today, not only in Settings, because the
// thing it answers is episodic. Being overstimulated happens at 4pm on a
// Tuesday; it is not a preference someone sets once, while calm, in
// anticipation of a bad hour they have not had yet. Settings still carries the
// standing version for people who want it on permanently — see settings.tsx.

function ComfortIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} />
      <Path d="M8.5 13.5a4 4 0 0 0 7 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Sits in AppLogoHeader's trailing slot next to the date. */
export function ComfortButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Comfort mode is on' : 'Turn on comfort mode'}
      hitSlop={10}
      style={({ pressed }) => [styles.iconButton, active && styles.iconButtonActive, pressed && styles.pressed]}>
      <ComfortIcon color={active ? '#cbd5e0' : '#7886a0'} />
    </Pressable>
  );
}

/**
 * Shown for the whole time an armed window is running. Non-negotiable: a mode
 * that changes what the app asks for must never be something you cannot see or
 * cannot leave. Both facts are on screen — what is on, when it ends — and
 * turning it off is one tap, in the same place.
 */
export function ComfortBanner({ comfort, timeFormat, onTurnOff }: {
  comfort: Comfort;
  timeFormat: TimeFormat;
  onTurnOff: () => void;
}) {
  if (!comfort.active) return null;

  const endsLabel = comfort.endsAt
    ? `Until ${formatTime(comfort.endsAt.toISOString(), timeFormat)}`
    : 'On until you turn it off';

  return (
    <View style={styles.banner}>
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>Comfort mode</Text>
        <Text style={styles.bannerMeta}>
          {endsLabel}
          {comfort.reducesDemand ? ' · reminders paused' : ''}
        </Text>
      </View>
      <Pressable onPress={onTurnOff} accessibilityRole="button" hitSlop={8}
        style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.bannerAction}>Turn off</Text>
      </Pressable>
    </View>
  );
}

/**
 * Two durations, deliberately. A picker is itself a demand — scrolling a wheel
 * to decide how long you will need to feel better is exactly the kind of small
 * decision this mode exists to take away.
 */
const DURATIONS: { value: ComfortDuration; label: string; hint: string }[] = [
  { value: '2h', label: 'For 2 hours', hint: 'Back to normal after that.' },
  { value: 'today', label: 'Rest of today', hint: 'Ends at midnight.' },
];

export function ComfortSheet({ comfort, onClose }: { comfort: Comfort; onClose: () => void }) {
  const arm = async (duration: ComfortDuration) => {
    await comfort.arm(duration);
    onClose();
  };

  return (
    <SheetShell
      title="Comfort mode"
      description="Quieter colours, larger text, no countdown. Reminders pause and you can log a day in one tap."
      onClose={onClose}>
      <View style={styles.options}>
        {DURATIONS.map(d => (
          <Pressable
            key={d.value}
            onPress={() => arm(d.value)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
            <Text style={styles.optionLabel}>{d.label}</Text>
            <Text style={styles.optionHint}>{d.hint}</Text>
          </Pressable>
        ))}
      </View>

      {comfort.error ? <Text style={styles.error}>{comfort.error}</Text> : null}

      {comfort.reducesDemand ? (
        <Pressable
          onPress={async () => { await comfort.disarm(); onClose(); }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.turnOff, pressed && styles.pressed]}>
          <Text style={styles.turnOffText}>Turn off now</Text>
        </Pressable>
      ) : null}

      <Text style={styles.footnote}>
        Text size for the whole app follows your phone&apos;s own setting, which you can change in
        Settings &rsaquo; Display.
      </Text>

      <SheetCancel onPress={onClose} label="Not now" />
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  iconButton: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  iconButtonActive: { borderColor: '#252a44', backgroundColor: '#12162b' },

  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    backgroundColor: '#12162b', borderWidth: 1, borderColor: '#252a44', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 18, marginBottom: 16,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '600', color: '#cbd5e0' },
  bannerMeta: { fontSize: 13, color: '#7886a0', marginTop: 2 },
  bannerAction: { fontSize: 14, fontWeight: '600', color: '#a5abc9' },

  options: { gap: 10, paddingTop: 8 },
  option: {
    borderWidth: 1, borderColor: '#252b3b', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 18, backgroundColor: '#181c26',
  },
  optionLabel: { fontSize: 16, fontWeight: '600', color: '#e2e8f0' },
  optionHint: { fontSize: 13, color: '#7886a0', marginTop: 3 },

  error: { fontSize: 13, color: '#f87171', marginTop: 12 },

  turnOff: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  turnOffText: { fontSize: 15, fontWeight: '600', color: '#cbd5e0' },

  footnote: { fontSize: 12, color: '#6b7690', lineHeight: 17, marginTop: 16, marginBottom: 4 },
});
