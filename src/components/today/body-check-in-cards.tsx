import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import BodyCheckIn from '@/components/body/body-check-in';
import MorningBodyCheckIn from '@/components/body/morning-body-check-in';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';

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

export function BodyCheckInCard() {
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

  if (!enabled || nowMinutes() < parseTimeToMinutes(availableFrom)) return null;

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
          <Text style={styles.morningSub}>Fatigue, pain, and standing up, before the day starts</Text>
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

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  card: {
    marginTop: 16, marginBottom: 16, backgroundColor: '#12162b',
    borderWidth: 1, borderColor: '#3730a3', borderRadius: 24,
    paddingTop: 32, paddingHorizontal: 28, paddingBottom: 28, gap: 24,
  },
  cardDone: { opacity: 0.55 },
  eyebrow: { fontSize: 12, color: '#818cf8', letterSpacing: 1.4, fontWeight: '700', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 22, color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.4 },
  cta: { paddingVertical: 18, borderRadius: 14, backgroundColor: '#4f46e5', alignItems: 'center' },
  ctaSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3730a3' },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  ctaTextSecondary: { color: '#a5b4fc' },

  morningCard: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#263045', borderRadius: 16,
    padding: 16, marginBottom: 12, gap: 12,
  },
  morningText: { gap: 3 },
  morningLabel: { fontSize: 15, fontWeight: '500', color: '#e2e8f0' },
  morningSub: { fontSize: 12, color: '#8892a4', lineHeight: 17 },
  morningActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  morningButton: {
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  morningButtonText: { fontSize: 13, fontWeight: '600', color: '#a5b4fc' },
  morningDismiss: { fontSize: 13, color: '#64748b' },
});
