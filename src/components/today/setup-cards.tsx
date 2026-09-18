import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import MarkerModal from '@/components/marker-modal';
import CheckInPreferencesStep from '@/components/onboarding/check-in-preferences-step';
import DomainSelectionStep from '@/components/onboarding/domain-selection-step';
import { useAuth } from '@/contexts/auth-context';
import { useBodyTrackingSettings } from '@/hooks/use-body-tracking-settings';
import type { SetupCardState } from '@/hooks/use-setup-cards';
import { BODY_DOMAINS, CHECKIN_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { BODY_COLOR } from '@/lib/domains';
import { subscribeToPushNotifications } from '@/lib/push-notifications';
import { createMarker } from '@/lib/queries/markers';
import { recordFirstCheckinsScheduledMilestone } from '@/lib/milestones';
import { ensureTodayCheckIns } from '@/lib/scheduler';
import { supabase, type BodyDomainType, type DomainType } from '@/lib/supabase';
import { todayDateString } from '@/lib/date-utils';
import { TimeField } from '@/components/today/time-field';

/**
 * First-run setup, as cards on Today rather than a wizard in front of it.
 *
 * Onboarding now stops after consent. The things that used to block entry —
 * domains, check-in times, body symptoms — are asked for here, inside the app,
 * in whatever order the person wants, with the app visible behind them. Each
 * card disappears the moment its job is done.
 *
 * Reminders come first deliberately. Check-ins are scheduled at unpredictable
 * times inside the chosen window; without a notification there is nothing to
 * tell you one is due, so it is the single thing the product most depends on.
 *
 * No baseline questions. The app works its own baselines out from the first
 * fortnight of check-ins, and asking someone to estimate their usual anxiety
 * before they have logged anything produced a number nobody could stand behind.
 * Choosing domains seeds a neutral row per domain instead, which
 * rolling-baseline-recalc.ts supersedes once there is enough history.
 */

interface Props {
  state: SetupCardState;
  /** Re-runs the card query and Today's own data after any card completes. */
  onChanged: () => void;
}

function SetupCard({ title, body, action, onPress, onSecondary, secondaryLabel, tone = 'indigo' }: {
  title: string;
  body: string;
  action: string;
  onPress: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
  tone?: 'indigo' | 'body';
}) {
  const accent = tone === 'body' ? BODY_COLOR : '#818cf8';
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <View style={styles.cardActions}>
        <Pressable onPress={onPress} style={({ pressed }) => [styles.cardButton, { backgroundColor: accent }, pressed && styles.pressed]}>
          <Text style={styles.cardButtonText}>{action}</Text>
        </Pressable>
        {onSecondary && secondaryLabel && (
          <Pressable onPress={onSecondary} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.cardSecondary}>{secondaryLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function SetupCards({ state, onChanged }: Props) {
  const { user, profile, refreshProfile } = useAuth();
  const [sheet, setSheet] = useState<null | 'domains' | 'times' | 'body' | 'cycle'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = useBodyTrackingSettings(user?.id, profile, refreshProfile, {
    defaultDomains: CHECKIN_BODY_DOMAIN_ORDER,
    onError: setError,
  });
  const [bodyFrom, setBodyFrom] = useState<string | null>(null);
  const [bodyRemind, setBodyRemind] = useState<string | null>(null);

  const markAcked = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error: e } = await supabase.from('check_in_settings').upsert(
      { user_id: user.id, ...patch }, { onConflict: 'user_id' },
    );
    if (e) { setError('Could not save that. Try again.'); return; }
    onChanged();
  };

  // ── Reminders ─────────────────────────────────────────────────────────────
  const handleNotifications = async (enable: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    if (enable) {
      const result = await subscribeToPushNotifications(user.id);
      if (!result.success) {
        // A refusal is an answer: record it so the card stops asking, and say
        // what happened rather than failing silently.
        setError(result.message);
        await markAcked({ setup_notifications_ack_at: new Date().toISOString() });
        await refreshProfile();
        setBusy(false);
        return;
      }
      await refreshProfile();
    }
    await markAcked({ setup_notifications_ack_at: new Date().toISOString() });
    setBusy(false);
  };

  // ── Mind domains ──────────────────────────────────────────────────────────
  const [pickedDomains, setPickedDomains] = useState<DomainType[]>([]);

  const saveDomains = async () => {
    if (!user || pickedDomains.length < 2) return;
    setBusy(true);
    setError(null);

    const { error: settingsError } = await supabase.from('check_in_settings').upsert(
      { user_id: user.id, active_domains: pickedDomains }, { onConflict: 'user_id' },
    );
    if (settingsError) { setError('Could not save your domains. Try again.'); setBusy(false); return; }

    // Neutral seed rows rather than asked-for numbers. Every read of a baseline
    // falls back to the scale midpoint anyway, but a real row means nothing
    // downstream has to care whether one exists, and the weekly rolling recalc
    // (which is append-only, and expects a prior row) takes over from day 14.
    const seeds = pickedDomains.map(domain => ({
      user_id: user.id, domain, baseline_score: 5, source: 'default' as const, is_current: true,
    }));
    const { error: baselineError } = await supabase.from('baselines').insert(seeds);
    if (baselineError) { setError('Could not set up your baselines. Try again.'); setBusy(false); return; }

    const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await ensureTodayCheckIns(user.id, timezone);
      await recordFirstCheckinsScheduledMilestone(user.id);
    } catch (e) {
      // The domains saved; only scheduling failed. Say so rather than implying
      // the whole thing went wrong.
      console.error('[SetupCards] scheduling after domain selection:', e);
      setError("Your domains saved, but today's check-ins couldn't be scheduled. Pull to refresh.");
    }

    setBusy(false);
    setSheet(null);
    onChanged();
  };

  // ── Body ──────────────────────────────────────────────────────────────────
  const saveBody = async () => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await body.handleSaveBodyTiming(
        bodyFrom ?? body.bodyAvailableFrom,
        bodyRemind ?? body.bodyReminderTime,
        body.bodyMorningEnabled,
        body.bodyMorningTime,
      );
      const { error: e } = await supabase.from('profiles').update({ body_setup_complete: true }).eq('id', user.id);
      if (e) throw e;
      await refreshProfile();
      setSheet(null);
      onChanged();
    } catch {
      setError('Could not save your body settings. Try again.');
    }
    setBusy(false);
  };

  if (state.loading || !state.anyOutstanding) return null;

  return (
    <View style={styles.stack}>
      {error && <Text style={styles.error}>{error}</Text>}

      {state.needsNotifications && (
        <SetupCard
          title="Turn on reminders"
          body="Symetric nudges you at unpredictable times inside your chosen hours — that's what stops it becoming a diary you forget. Without reminders you'd have to remember to open the app."
          action={busy ? 'Working…' : 'Turn on'}
          onPress={() => handleNotifications(true)}
          onSecondary={() => handleNotifications(false)}
          secondaryLabel="Not now"
        />
      )}

      {state.needsMindDomains && (
        <SetupCard
          title="What do you want to track?"
          body="Pick as few as 2 or as many as 8. Every check-in only ever shows what you choose here, so there's nothing to scroll past later."
          action="Choose domains"
          onPress={() => { setPickedDomains([]); setSheet('domains'); }}
        />
      )}

      {state.needsTimes && (
        <SetupCard
          title="When should check-ins happen?"
          body="Your waking hours and how many times a day to ask. You can change this whenever you like."
          action="Set my hours"
          onPress={() => setSheet('times')}
        />
      )}

      {state.needsBodySetup && (
        <SetupCard
          tone="body"
          title="Set up body tracking"
          body="Choose which physical symptoms to track, when the evening check-in opens, and when to be reminded."
          action="Set up Body"
          onPress={() => setSheet('body')}
        />
      )}

      {state.needsCycleDayOne && (
        <SetupCard
          title="Know when your last period started?"
          body="Recording it means day counts work straight away, instead of waiting for your next one."
          action="Add it"
          onPress={() => setSheet('cycle')}
          onSecondary={async () => {
            if (!user) return;
            await supabase.from('profiles')
              .update({ cycle_day_one_prompt_ack_at: new Date().toISOString() }).eq('id', user.id);
            await refreshProfile();
            onChanged();
          }}
          secondaryLabel="Skip — I'd rather not"
        />
      )}

      {/* ── Sheets ───────────────────────────────────────────────────────── */}

      <Modal visible={sheet === 'domains'} animationType="slide" onRequestClose={() => setSheet(null)}>
        <DomainSelectionStep
          selectedDomains={pickedDomains}
          onUpdate={setPickedDomains}
          onNext={saveDomains}
          onBack={() => setSheet(null)}
        />
      </Modal>

      <Modal visible={sheet === 'times'} animationType="slide" onRequestClose={() => setSheet(null)}>
        <TimesSheet
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); onChanged(); }}
          onError={setError}
        />
      </Modal>

      <Modal visible={sheet === 'body'} animationType="slide" onRequestClose={() => setSheet(null)}>
        <ScrollView contentContainerStyle={styles.sheet}>
          <Text style={styles.sheetTitle}>Set up body tracking</Text>

          <Text style={styles.sheetLabel}>WHICH SYMPTOMS</Text>
          <View style={styles.pillRow}>
            {CHECKIN_BODY_DOMAIN_ORDER.filter(d => !BODY_DOMAINS[d].required).map(d => {
              const active = body.bodyDomainsActive.includes(d as BodyDomainType);
              return (
                <Pressable key={d} onPress={() => body.handleToggleBodyDomain(d as BodyDomainType)}
                  style={[styles.pill, active && styles.pillActive]}>
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{BODY_DOMAINS[d].label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>THE EVENING CHECK-IN OPENS AT</Text>
          <TimeField value={bodyFrom ?? body.bodyAvailableFrom} onChange={setBodyFrom} />

          <Text style={styles.sheetLabel}>REMIND ME AT</Text>
          <TimeField value={bodyRemind ?? body.bodyReminderTime} onChange={setBodyRemind} />

          <Pressable onPress={saveBody} style={({ pressed }) => [styles.sheetSave, pressed && styles.pressed]}>
            <Text style={styles.sheetSaveText}>{busy ? 'Saving…' : 'Done'}</Text>
          </Pressable>
          <Pressable onPress={() => setSheet(null)}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      {sheet === 'cycle' && (
        <MarkerModal
          defaultDate={todayDateString()}
          cycleTrackingEnabled
          onClose={() => setSheet(null)}
          onSave={async input => {
            await createMarker(input);
            setSheet(null);
            onChanged();
          }}
        />
      )}
    </View>
  );
}

/** Wraps the onboarding preferences step so it saves and stamps the card done. */
function TimesSheet({ onClose, onSaved, onError }: {
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const { user } = useAuth();
  // Seeded from the table's own defaults so the card is a confirm, not a blank
  // form — check_in_settings defaults to 3 a day between 09:00 and 21:00.
  const [perDay, setPerDay] = useState(3);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('21:00');

  const save = async () => {
    if (!user) return;
    const { error } = await supabase.from('check_in_settings').upsert({
      user_id: user.id,
      check_ins_per_day: perDay,
      window_start: start,
      window_end: end,
      setup_times_confirmed_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) { onError('Could not save your hours. Try again.'); return; }
    onSaved();
  };

  return (
    <CheckInPreferencesStep
      checkInsPerDay={perDay}
      windowStart={start}
      windowEnd={end}
      onUpdate={u => {
        if (u.checkInsPerDay !== undefined) setPerDay(u.checkInsPerDay);
        if (u.windowStart !== undefined) setStart(u.windowStart);
        if (u.windowEnd !== undefined) setEnd(u.windowEnd);
      }}
      onNext={save}
      onBack={onClose}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, marginBottom: 24 },
  error: { fontSize: 13, color: '#f87171', lineHeight: 19 },
  card: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderLeftWidth: 3, borderRadius: 12, padding: 16, gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  cardBody: { fontSize: 13.5, color: '#8892a4', lineHeight: 20 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  cardButton: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16 },
  cardButtonText: { fontSize: 14, fontWeight: '600', color: '#0a0c12' },
  cardSecondary: { fontSize: 13, color: '#6b7a99' },
  pressed: { opacity: 0.7 },

  sheet: { padding: 24, paddingTop: 60, paddingBottom: 60, gap: 10, backgroundColor: '#0a0c12', flexGrow: 1 },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: '#e2e8f0', marginBottom: 12 },
  sheetLabel: { fontSize: 11, color: '#6b7a99', letterSpacing: 0.9, marginTop: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: '#1e2533', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 },
  pillActive: { borderColor: BODY_COLOR, backgroundColor: 'rgba(188,129,47,0.12)' },
  pillText: { fontSize: 13, color: '#8892a4' },
  pillTextActive: { color: '#e2c08a' },
  sheetSave: { marginTop: 28, backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetSaveText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sheetCancel: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 14 },
});
