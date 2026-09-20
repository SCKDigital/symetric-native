import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import BodyCheckIn from '@/components/body/body-check-in';
import MorningBodyCheckIn from '@/components/body/morning-body-check-in';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { useComfort } from '@/hooks/use-comfort';
import { COMFORT_TOKENS, NORMAL_TOKENS, type ComfortTokens } from '@/lib/comfort-theme';
import { formatWindowTime, type TimeFormat } from '@/lib/time-format';
import { BRAND, brandTint } from '@/constants/brand';

// Ports of the web app's BodyCheckInCard.tsx and MorningBodyCheckInCard.tsx —
// the Today entry points into the body check-in forms. Native already had both
// forms, but reached them from two buttons buried in Settings; the Settings
// rebuild drops those, so without these cards there would be no way to log a
// body check-in at all.
//
// Both are gated purely on the profile's own body fields and its
// body_available_from / body_morning_time clock, never on check_in_settings'
// window — body tracking is deliberately independent of the mind scheduler.

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function localDateStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function TickIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="#34d399" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={8} cy={8} r={6.5} />
      <Polyline points="5.2 8 7.2 10 10.8 6" />
    </Svg>
  );
}

export function BodyCheckInCard({ timeFormat }: { timeFormat: TimeFormat }) {
  const styles = useComfort().active ? STYLES.comfort : STYLES.normal;
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggedToday, setLoggedToday] = useState(false);

  const enabled = profile?.body_tracking_enabled ?? false;
  const availableFrom = profile?.body_available_from ?? '17:00';

  const refreshLoggedState = useCallback(async () => {
    if (!user || !enabled) return;
    const { data } = await supabase
      .from('body_checkins').select('id')
      .eq('user_id', user.id).eq('entry_date', localDateStr()).maybeSingle();
    setLoggedToday(!!data);
  }, [user, enabled]);

  useEffect(() => {
    // Async fetch-on-mount: refreshLoggedState only setStates after its await.
    // See use-today-check-ins.ts for why the linter can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLoggedState();
  }, [refreshLoggedState]);

  if (!enabled) return null;

  // Before the evening window opens, say so rather than rendering nothing.
  // An absent card is indistinguishable from a broken one, and "it opens at
  // 17:00" is the answer to the question someone is actually asking when they
  // look for it and it isn't there.
  if (nowMinutes() < parseTimeToMinutes(availableFrom)) {
    return (
      <View style={[styles.card, styles.cardPending]}>
        <Text style={styles.eyebrow}>BODY CHECK-IN</Text>
        <Text style={styles.status}>Opens at {formatWindowTime(availableFrom, timeFormat)}</Text>
      </View>
    );
  }


  return (
    <>
      <View style={[styles.card, loggedToday && styles.cardDone]}>
        <Text style={styles.eyebrow}>BODY CHECK-IN</Text>
        <View style={styles.statusRow}>
          {loggedToday && <TickIcon />}
          <Text style={styles.status}>{loggedToday ? 'Logged' : 'Now open'}</Text>
        </View>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.cta, loggedToday && styles.ctaSecondary, pressed && styles.pressed]}>
          <Text style={[styles.ctaText, loggedToday && styles.ctaTextSecondary]}>
            {loggedToday ? 'Edit' : 'Log body check-in'}
          </Text>
        </Pressable>
      </View>

      <BodyCheckIn visible={open} onClose={() => { setOpen(false); refreshLoggedState(); }} />
    </>
  );
}

export function MorningBodyCheckInCard() {
  const styles = useComfort().active ? STYLES.comfort : STYLES.normal;
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggedToday, setLoggedToday] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const enabled = profile?.body_morning_enabled ?? false;
  const morningTime = profile?.body_morning_time ?? '08:00';

  const refreshLoggedState = useCallback(async () => {
    if (!user || !enabled) return;
    const { data } = await supabase
      .from('body_checkins').select('morning_fatigue')
      .eq('user_id', user.id).eq('entry_date', localDateStr()).maybeSingle();
    setLoggedToday(data?.morning_fatigue != null);
  }, [user, enabled]);

  useEffect(() => {
    // Async fetch-on-mount: refreshLoggedState only setStates after its await.
    // See use-today-check-ins.ts for why the linter can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLoggedState();
  }, [refreshLoggedState]);

  // Unlike the evening card this disappears once answered or dismissed — it's
  // an optional prompt, not a standing entry point.
  if (!enabled || nowMinutes() < parseTimeToMinutes(morningTime) || loggedToday || dismissed) return null;

  return (
    <>
      <View style={styles.morningCard}>
        <View style={styles.morningText}>
          <Text style={styles.morningLabel}>Morning check-in</Text>
          <Text style={styles.morningSub}>Fatigue, pain, and dizziness, before the day starts</Text>
        </View>
        <View style={styles.morningActions}>
          <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.morningButton, pressed && styles.pressed]}>
            <Text style={styles.morningButtonText}>Log</Text>
          </Pressable>
          <Pressable onPress={() => setDismissed(true)}>
            <Text style={styles.morningDismiss}>Not today</Text>
          </Pressable>
        </View>
      </View>

      <MorningBodyCheckIn visible={open} onClose={() => { setOpen(false); refreshLoggedState(); }} />
    </>
  );
}

const STYLES = { normal: makeStyles(NORMAL_TOKENS), comfort: makeStyles(COMFORT_TOKENS) };

function makeStyles(t: ComfortTokens) {
  return StyleSheet.create({
  pressed: { opacity: 0.85 },

  card: {
    marginTop: 16, marginBottom: 16, backgroundColor: BRAND.surface,
    borderWidth: 1, borderColor: BRAND.border, borderRadius: 24,
    paddingTop: 32, paddingHorizontal: 28, paddingBottom: 28, gap: 24,
  },
  cardDone: { opacity: 0.55 },
  cardPending: { opacity: 0.45 },
  eyebrow: { fontSize: t.fs(12), color: BRAND.text, letterSpacing: 1.4, fontWeight: '700', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: t.fs(22), color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.4 },
  cta: { paddingVertical: 18, borderRadius: 14, backgroundColor: BRAND.fill, alignItems: 'center' },
  ctaSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: BRAND.border },
  ctaText: { fontSize: t.fs(17), fontWeight: '700', color: '#ffffff' },
  ctaTextSecondary: { color: BRAND.textSoft },

  morningCard: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#263045', borderRadius: 16,
    padding: 16, marginBottom: 12, gap: 12,
  },
  morningText: { gap: 3 },
  morningLabel: { fontSize: t.fs(15), fontWeight: '500', color: '#e2e8f0' },
  morningSub: { fontSize: t.fs(12), color: '#8892a4', lineHeight: 17 },
  morningActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  morningButton: {
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: brandTint(BRAND.fillAlt, 0.15),
  },
  morningButtonText: { fontSize: t.fs(13), fontWeight: '600', color: BRAND.textSoft },
  morningDismiss: { fontSize: t.fs(13), color: '#64748b' },
  });
}
