import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import BodyCheckIn from '@/components/body/body-check-in';
import MorningBodyCheckIn from '@/components/body/morning-body-check-in';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import type { BodyDomainType } from '@/lib/supabase';
import { useComfort } from '@/hooks/use-comfort';
import { type ComfortTokens } from '@/lib/comfort-theme';
import { formatWindowTime, type TimeFormat } from '@/lib/time-format';
import { brandTint } from '@/constants/brand';
import type { AccentTokens } from '@/constants/accents';
import { makeComfortStyles } from '@/lib/accent-styles';
import { BODY_DOMAINS, CHECKIN_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { rollingBodyBaseline } from '@/lib/detection/body-baseline';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import { trackBodyCheckInCompleted } from '@/lib/analytics';
import { forcePatternDetection } from '@/lib/pattern-detection-scheduler';

// Ports of the web app's BodyCheckInCard.tsx and MorningBodyCheckInCard.tsx —
// the Today entry points into the body check-in forms. Native already had both
// forms, but reached them from two buttons buried in Settings; the Settings
// rebuild drops those, so without these cards there would be no way to log a
// body check-in at all.
//
// Both are gated purely on the profile's own body fields and its
// body_available_from / body_morning_time clock, never on check_in_settings'
// window — body tracking is deliberately independent of the mind scheduler.
//
// BodyCheckInCard also carries comfort mode's one-tap, which the mind cards
// (check-in-cards.tsx) have always had and this one didn't. Comfort mode
// already muted the push reminder to log a body check-in (send-notifications'
// isComfortMuted) but did nothing to make actually logging one easier — which
// is backwards for who it's for, since body domains (pain, breathlessness,
// orthostatic, gut, exhaustion) are exactly what's hardest to rate in detail
// during a bad hour. The evening form already rests every untouched slider at
// its own rolling baseline (body-check-in.tsx), so submitting untouched
// already means "typical for me" — this just adds a button that submits that
// state directly, flagged low_demand, without opening the form.
//
// Scoped to the evening card only. The morning form (morning-body-check-in.tsx)
// doesn't rest its sliders at a baseline the same way — an untouched morning
// domain saves as null, not a value — so a morning one-tap needs that
// convention built first rather than reusing this one.

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
  const { active, reducesDemand } = useComfort();
  const styles = useStyles(active);
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggedToday, setLoggedToday] = useState(false);
  const [loggingAsUsual, setLoggingAsUsual] = useState(false);

  const enabled = profile?.body_tracking_enabled ?? false;
  const availableFrom = profile?.body_available_from ?? '17:00';

  // profiles.body_domains_active's DB default/history can still carry the
  // legacy 'exertion' value — filtering through CHECKIN_BODY_DOMAIN_ORDER
  // drops it, same defensive pattern body-check-in.tsx and
  // body-cluster-detection.ts both already use.
  const activeDomains: BodyDomainType[] = profile?.body_domains_active?.length
    ? CHECKIN_BODY_DOMAIN_ORDER.filter(d => profile.body_domains_active.includes(d) || BODY_DOMAINS[d].required)
    : CHECKIN_BODY_DOMAIN_ORDER;

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

  /**
   * The one-tap, offered only inside an armed comfort window (reducesDemand),
   * same restriction as the mind cards. Computes exactly what an untouched
   * form submission would have saved — each domain's own 90-day rolling
   * baseline, same window and function body-check-in.tsx's own baseline
   * effect uses — and inserts directly, flagged low_demand, skipping the
   * form entirely.
   */
  const logAsUsual = async () => {
    if (!user || loggingAsUsual) return;
    setLoggingAsUsual(true);
    try {
      const today = localDateStr();
      const from = new Date(Date.now() - 90 * 86_400_000).toLocaleDateString('en-CA');
      const { data } = await supabase
        .from('body_checkins').select('*')
        .eq('user_id', user.id).gte('entry_date', from).lt('entry_date', today)
        .order('entry_date', { ascending: true });
      const rows = (data ?? []) as Record<string, unknown>[];

      const payload: Record<string, unknown> = { user_id: user.id, entry_date: today, low_demand: true };
      for (const d of activeDomains) {
        const history = rows.map(r => dailyBodyValue(r, d)).filter((v): v is number => v !== null);
        // Rounded: the slider steps in whole numbers and the columns are
        // smallint, matching body-check-in.tsx's own rounding.
        payload[d] = Math.round(rollingBodyBaseline(history));
      }

      const { error } = await supabase.from('body_checkins').insert(payload);
      if (error) {
        console.error('[BodyCheckInCard] one-tap check-in failed:', error);
        return;
      }
      trackBodyCheckInCompleted(activeDomains.length, 0, false);
      setLoggedToday(true);
      forcePatternDetection(user.id).catch(e => console.error('[BodyCheckInCard] force detection:', e));
    } finally {
      setLoggingAsUsual(false);
    }
  };

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
        {reducesDemand && !loggedToday ? (
          <Pressable
            onPress={logAsUsual}
            disabled={loggingAsUsual}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <Text style={styles.asUsual}>{loggingAsUsual ? 'Logging…' : 'Nothing unusual today'}</Text>
          </Pressable>
        ) : null}
      </View>

      <BodyCheckIn visible={open} onClose={() => { setOpen(false); refreshLoggedState(); }} />
    </>
  );
}

export function MorningBodyCheckInCard() {
  const styles = useStyles(useComfort().active);
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

const useStyles = makeComfortStyles(makeStyles);

function makeStyles(t: ComfortTokens, b: AccentTokens) {
  return StyleSheet.create({
  pressed: { opacity: 0.85 },

  card: {
    marginTop: 16, marginBottom: 16, backgroundColor: b.surface,
    borderWidth: 1, borderColor: b.border, borderRadius: 24,
    paddingTop: 32, paddingHorizontal: 28, paddingBottom: 28, gap: 24,
  },
  cardDone: { opacity: 0.55 },
  cardPending: { opacity: 0.45 },
  eyebrow: { fontSize: t.fs(12), color: b.text, letterSpacing: 1.4, fontWeight: '700', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: t.fs(22), color: '#e2e8f0', fontWeight: '600', letterSpacing: -0.4 },
  cta: { paddingVertical: 18, borderRadius: 14, backgroundColor: b.fill, alignItems: 'center' },
  ctaSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: b.border },
  ctaText: { fontSize: t.fs(17), fontWeight: '700', color: t.accentOn },
  ctaTextSecondary: { color: b.textSoft },
  // Comfort mode's one-tap — same shape as check-in-cards.tsx's AsUsualButton.
  asUsual: {
    fontSize: t.fs(15), fontWeight: '600', color: '#cbd5e0', textAlign: 'center',
    paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: b.border,
  },

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
    backgroundColor: brandTint(b.fillAlt, 0.15),
  },
  morningButtonText: { fontSize: t.fs(13), fontWeight: '600', color: b.textSoft },
  morningDismiss: { fontSize: t.fs(13), color: '#64748b' },
  });
}
