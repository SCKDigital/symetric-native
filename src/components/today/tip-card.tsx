import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AppLockPinSheet from '@/components/settings/app-lock-pin-sheet';
import { ACCENTS, ACCENT_LABELS, ACCENT_NAMES, type AccentName } from '@/constants/accents';
import { useAccent, useAccentChoice } from '@/contexts/accent-context';
import { useAppLockSettings } from '@/hooks/use-app-lock-settings';
import type { Comfort } from '@/hooks/use-comfort';
import type { SetupCardState } from '@/hooks/use-setup-cards';
import { useTipDeck } from '@/hooks/use-tip-deck';
import { makeAccentStyles } from '@/lib/accent-styles';
import { PIN_LENGTH } from '@/lib/app-lock';
import { BODY_COLOR } from '@/lib/domains';
import type { TipId } from '@/lib/tips/deck';

/**
 * One tip on Today, from the day after sign-up. Which tip, and when, is
 * lib/tips/deck.ts and hooks/use-tip-deck.ts; this is what each one says and
 * what its buttons do.
 *
 * Tips about something that lives in Settings say so in their label
 * ("SETTINGS WORTH KNOWING"), so it's clear where to find it again.
 *
 * Two tips change the app in place rather than describing a change: comfort
 * mode switches on behind its own card ("Try it", then "Keep it on" or
 * "Undo"), and the colour swatches repaint the app on each tap. Comfort mode
 * normally hides tips altogether; the comfort tip is exempt while it is
 * previewing itself.
 */

interface Props {
  setup: SetupCardState;
  /** Today's own comfort state, so the preview repaints Today on the tap. */
  comfort: Comfort;
  /** True while Today has something that mustn't have a tip above it. */
  hidden: boolean;
  onAddEvent: () => void;
  onCheckInNow: () => void;
}

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  action: string;
  secondary?: 'Not now' | 'Later';
  tone?: 'body';
}

const SETTINGS = 'SETTINGS WORTH KNOWING';

const COPY: Record<TipId, Copy> = {
  lock: {
    eyebrow: SETTINGS, title: 'Keep it to yourself',
    body: `Add a ${PIN_LENGTH}-digit PIN and Symetric asks for it every time it opens. Worth it if your phone ever gets handed around.`,
    action: 'Set a PIN',
  },
  comfort: {
    eyebrow: SETTINGS, title: 'A quieter Symetric',
    body: 'One calm colour, larger check-in text and no countdowns. Try it and this screen changes right away. You can undo it.',
    action: 'Try it',
  },
  colour: {
    eyebrow: SETTINGS, title: 'Pick your colour',
    body: 'Buttons, links and tabs. Tap one to see it across the app. Your charts keep their own colours.',
    action: 'Keep',
  },
  events: {
    eyebrow: 'WORTH KNOWING', title: 'Mark the things that change things',
    body: 'Started a medication, had a therapy session, moved house? Add it as an event and it shows on your charts, so you can see what came before and after.',
    action: 'Add an event',
  },
  checkInAnytime: {
    eyebrow: 'WORTH KNOWING', title: 'You don’t have to wait to be asked',
    body: 'If something shifts between check-ins, log it now. Extra check-ins count alongside the scheduled ones.',
    action: 'Check in now',
  },
  yourData: {
    eyebrow: SETTINGS, title: 'Your data is yours',
    body: 'Export everything as CSV or JSON whenever you like, or delete a stretch of days you’d rather not keep.',
    action: 'Show me',
  },
  firstPattern: {
    eyebrow: 'NEW IN INSIGHTS', title: 'Symetric noticed something',
    body: 'There’s enough in your check-ins to show a first pattern. Have a look when you have a minute.',
    action: 'Open Insights', secondary: 'Later',
  },
  baseline: {
    eyebrow: 'TWO WEEKS IN', title: 'Your baseline is ready',
    body: 'You’ve checked in enough for Symetric to work out what a usual day looks like for you. Changes and patterns are now measured against it, and it keeps updating as you go.',
    action: 'Got it',
  },
  prepare: {
    eyebrow: 'BEFORE YOUR NEXT APPOINTMENT', title: 'Take your check-ins with you',
    body: 'Prepare turns what you’ve logged into a report for your GP or therapist, and keeps the questions you want to ask.',
    action: 'Open Prepare',
  },
  morningBody: {
    eyebrow: 'BODY', title: 'Add a morning check-in?',
    body: 'A couple of quick questions before the day starts. It’s how Symetric tells a morning pattern from an evening one.',
    action: 'Set it up', tone: 'body',
  },
};

export default function TipCard({ setup, comfort, hidden, onAddEvent, onCheckInNow }: Props) {
  const styles = useStyles();
  const accent = useAccent();
  const accentChoice = useAccentChoice();
  const appLock = useAppLockSettings();
  const [previewingComfort, setPreviewingComfort] = useState(false);
  const [pinSheet, setPinSheet] = useState(false);
  // The colour they had when the tip appeared, for "Not now" to put back.
  const [originalAccent] = useState<AccentName>(accentChoice.name);
  const [error, setError] = useState<string | null>(null);

  const deck = useTipDeck(setup, hidden || (comfort.active && !previewingComfort));
  const tip = deck.tip;
  if (!tip) return null;

  const copy = COPY[tip];
  const edge = copy.tone === 'body' ? BODY_COLOR : accent.text;

  const primary = async () => {
    setError(null);
    switch (tip) {
      case 'lock': setPinSheet(true); return;
      case 'comfort':
        if (!previewingComfort) {
          setPreviewingComfort(true);
          await comfort.setStanding(true);
          return;
        }
        deck.retire(); // "Keep it on"
        return;
      case 'colour': deck.retire(); return;
      case 'events': deck.retire(); onAddEvent(); return;
      case 'checkInAnytime': deck.retire(); onCheckInNow(); return;
      case 'yourData': deck.retire(); router.push({ pathname: '/settings', params: { open: 'export' } }); return;
      case 'firstPattern': deck.retire(); router.push('/insights'); return;
      case 'baseline': deck.retire(); return;
      case 'prepare': deck.retire(); router.push('/prepare'); return;
      case 'morningBody': deck.retire(); router.push({ pathname: '/settings', params: { open: 'bodyMorning' } }); return;
    }
  };

  const secondary = async () => {
    if (tip === 'comfort' && previewingComfort) {
      await comfort.setStanding(false); // "Undo"
      deck.retire();
      return;
    }
    if (tip === 'colour' && accentChoice.name !== originalAccent) await accentChoice.setAccent(originalAccent);
    if (copy.secondary === 'Later') deck.defer();
    else deck.retire();
  };

  const previewing = tip === 'comfort' && previewingComfort;
  const title = previewing ? 'This is comfort mode' : copy.title;
  const body = previewing
    ? 'Keep it on, or put it back. On a hard day you can also turn it on for 2 hours from the face button, top right.'
    : copy.body;
  const actionLabel = previewing ? 'Keep it on'
    : tip === 'colour' ? `Keep ${ACCENT_LABELS[accentChoice.name]}`
    : copy.action;
  const secondaryLabel = previewing ? 'Undo' : (copy.secondary ?? 'Not now');

  return (
    <View style={[styles.card, { borderLeftColor: edge }]}>
      <Text style={[styles.eyebrow, { color: edge }]}>{previewing ? 'PREVIEW' : copy.eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {tip === 'colour' && (
        <View style={styles.swatches}>
          {ACCENT_NAMES.map(option => {
            const tokens = ACCENTS[option];
            const selected = option === accentChoice.name;
            return (
              <Pressable
                key={option}
                onPress={() => accentChoice.setAccent(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${ACCENT_LABELS[option]} accent`}
                style={({ pressed }) => [
                  styles.swatch,
                  selected && { borderColor: tokens.text },
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.chip, { backgroundColor: tokens.fill }]} />
                <Text style={[styles.swatchName, selected && { color: tokens.text }]}>{ACCENT_LABELS[option]}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {(error || comfort.error || accentChoice.error) && (
        <Text style={styles.error}>{error ?? comfort.error ?? accentChoice.error}</Text>
      )}

      <View style={styles.actions}>
        <Pressable onPress={primary} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
        <Pressable onPress={secondary} accessibilityRole="button" hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.secondary}>{secondaryLabel}</Text>
        </Pressable>
      </View>

      {pinSheet && (
        <AppLockPinSheet
          mode="enable"
          onClose={() => setPinSheet(false)}
          onSetPin={async pin => {
            try {
              await appLock.setPin(pin);
              deck.retire();
            } catch {
              setError('Could not set your PIN. Try again.');
            }
          }}
          onDisable={async () => {
            try { await appLock.disable(); } catch { setError('Could not turn that off. Try again.'); }
          }}
        />
      )}
    </View>
  );
}

// The setup card's shape (setup-cards.tsx), so tips read as part of the same
// app, with the label above the title to tell them apart from setup steps.
const useStyles = makeAccentStyles(b => ({
  card: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderLeftWidth: 3, borderRadius: 12, padding: 16, gap: 8, marginBottom: 24,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 0.9 },
  title: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  body: { fontSize: 13.5, color: '#8892a4', lineHeight: 20 },
  error: { fontSize: 13, color: '#f87171', lineHeight: 19 },
  swatches: { flexDirection: 'row', gap: 8, marginTop: 2 },
  swatch: {
    flex: 1, alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 8,
    borderRadius: 9, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#10131a',
  },
  chip: { width: 36, height: 24, borderRadius: 7 },
  swatchName: { fontSize: 11.5, color: '#8892a4', fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  button: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: b.fill },
  buttonText: { fontSize: 14, fontWeight: '600', color: b.onFill },
  secondary: { fontSize: 13, color: '#8892a4' },
  pressed: { opacity: 0.7 },
}));
