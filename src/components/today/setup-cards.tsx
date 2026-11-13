import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import CheckInPreferencesStep from '@/components/onboarding/check-in-preferences-step';
import DomainSelectionStep from '@/components/onboarding/domain-selection-step';
import { BodySetupFlow } from '@/components/setup/body-setup-flow';
import { CycleDayOneScreen } from '@/components/setup/cycle-day-one-screen';
import { ConfirmDialog } from '@/components/setup/setup-kit';
import { useModalTopPadding } from '@/components/shared/modal-keyboard-view';
import AppLockPinSheet from '@/components/settings/app-lock-pin-sheet';
import { Toggle } from '@/components/settings/settings-primitives';
import { useAuth } from '@/contexts/auth-context';
import { useAccent } from '@/contexts/accent-context';
import { useAppLockSettings } from '@/hooks/use-app-lock-settings';
import { useComfort } from '@/hooks/use-comfort';
import type { SetupCardState } from '@/hooks/use-setup-cards';
import { makeAccentStyles } from '@/lib/accent-styles';
import { PIN_LENGTH } from '@/lib/app-lock';
import { deviceTimeFormat } from '@/lib/device-clock';
import { BODY_COLOR } from '@/lib/domains';
import { recordFirstCheckinsScheduledMilestone } from '@/lib/milestones';
import { isOnline } from '@/lib/offline/connectivity';
import { saveCheckInSettings, saveProfile, seedBaselines } from '@/lib/offline/queued-writes';
import { subscribeToPushNotifications } from '@/lib/push-notifications';
import type { TimeRange } from '@/lib/quiet-hours';
import { ensureTodayCheckIns } from '@/lib/scheduler';
import { type DomainType } from '@/lib/supabase';

/**
 * First-run setup, as cards on Today rather than a wizard in front of it.
 *
 * Onboarding stops after consent. Everything the app needs before it can
 * check in is asked here, inside the app, with the app visible behind it.
 *
 * ── One card at a time (2026-11-14) ────────────────────────────────────────
 *
 * This used to stack every outstanding card at once: up to five equal cards
 * with five equal buttons, so nothing said where to start, and the last ones
 * fell below the fold. Now Today shows only the next step, under a
 * "Getting started · 1 of 3" line, and finishing it brings up the one after.
 *
 * The order is what to track, then when, then reminders, then body and cycle
 * for whoever opted in at consent. Reminders used to come first, because
 * without them nothing says a check-in is due; they still come before any
 * check-in is scheduled to be due, since today's check-ins are only scheduled
 * once both domains and hours exist (see scheduleTodayIfReady).
 *
 * Body and cycle each end with a way out ("I don't want to track my body"),
 * which turns that tracking off exactly as the Settings switch does and says
 * so in a confirmation.
 *
 * The privacy-and-comfort card stays last and outside the count: it asks for
 * nothing the app needs.
 *
 * No baseline questions. The app works its own baselines out from the first
 * fortnight of check-ins. Choosing domains seeds a neutral row per domain
 * instead, which rolling-baseline-recalc.ts supersedes once there is enough
 * history.
 */

interface Props {
  state: SetupCardState;
  /** Re-runs the card query and Today's own data after any card completes. */
  onChanged: () => void;
}

type Step = 'domains' | 'times' | 'notifications' | 'body' | 'cycle';
type Sheet = null | 'domains' | 'times' | 'body' | 'cycle' | 'preferences';
type OptOut = 'body' | 'cycle';

const OPT_OUT_COPY: Record<OptOut, { title: string; field: 'body_tracking_enabled' | 'cycle_tracking_enabled' }> = {
  body: { title: 'You will no longer be asked about body tracking.', field: 'body_tracking_enabled' },
  cycle: { title: 'You will no longer be asked about cycle tracking.', field: 'cycle_tracking_enabled' },
};

function SetupCard({ title, body, action, onPress, onSecondary, secondaryLabel, tone = 'indigo' }: {
  title: string;
  body: string;
  action: string;
  onPress: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
  tone?: 'indigo' | 'body';
}) {
  const styles = useStyles();
  const accentTokens = useAccent();
  const accent = tone === 'body' ? BODY_COLOR : accentTokens.text;
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <View style={styles.cardActions}>
        <Pressable onPress={onPress} style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}>
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
  const styles = useStyles();
  const accent = useAccent();
  const sheetPaddingTop = useModalTopPadding(60);
  const { user, profile, refreshProfile } = useAuth();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pinSheet, setPinSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<OptOut | null>(null);
  // iOS can't present a modal while another is still animating away, so the
  // confirmation waits for the sheet's onDismiss there.
  const pendingConfirm = useRef<OptOut | null>(null);

  const comfort = useComfort();
  const appLock = useAppLockSettings();

  // ── The steps, in order ───────────────────────────────────────────────────
  const steps: { key: Step; outstanding: boolean }[] = [
    { key: 'domains', outstanding: state.needsMindDomains },
    { key: 'times', outstanding: state.needsTimes },
    { key: 'notifications', outstanding: state.needsNotifications },
    ...(profile?.body_tracking_enabled ? [{ key: 'body' as const, outstanding: state.needsBodySetup }] : []),
    ...(profile?.cycle_tracking_enabled
      ? [{ key: 'cycle' as const, outstanding: state.needsCycleDayOne }]
      : []),
  ];
  // A cycle step already answered by an existing Day 1 still counts as done.
  const total = steps.length;
  const current = steps.find(s => s.outstanding)?.key ?? null;
  const done = steps.filter(s => !s.outstanding).length;
  const stepLabel = `Step ${done + 1} of ${total}`;
  const progress = total ? done / total : 1;

  const markAcked = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error: e } = await saveCheckInSettings(user.id, patch);
    if (e) { setError('Could not save that. Try again.'); return; }
    onChanged();
  };

  /**
   * Today's check-ins need both what to track and when. Whichever of the two
   * steps finishes second schedules them, so they're never laid out on the
   * database's default hours before she has set her own.
   */
  const scheduleTodayIfReady = async (otherStepDone: boolean) => {
    if (!user || !otherStepDone || !isOnline()) return;
    const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await ensureTodayCheckIns(user.id, timezone);
      await recordFirstCheckinsScheduledMilestone(user.id);
    } catch (e) {
      // The step saved; only scheduling failed. Say so rather than implying
      // the whole thing went wrong. Today's next load schedules them.
      console.error('[SetupCards] scheduling after setup:', e);
      setError("Your choices saved, but today's check-ins couldn't be scheduled. Pull to refresh.");
    }
  };

  // ── Reminders ─────────────────────────────────────────────────────────────
  const handleNotifications = async (enable: boolean) => {
    if (!user || busy) return;
    // Turning reminders on registers this phone with Expo's push service, so
    // it genuinely needs a connection. "Not now" is just a setting, and queues.
    if (enable && !isOnline()) {
      setError('Unavailable offline. Turning reminders on needs a connection.');
      return;
    }
    setBusy(true);
    setError(null);
    if (enable) {
      const result = await subscribeToPushNotifications(user.id);
      if (!result.success) {
        setError(result.message);
        // Only a decision gets recorded. 'denied' and 'blocked' are the user
        // answering; 'error' covers a missing project id, an expired session
        // or a failed write, and 'unsupported' just means a simulator. Acking
        // on those would let one bad moment permanently hide the card for the
        // feature the whole app runs on — and the user would never know why.
        if (result.reason === 'denied' || result.reason === 'blocked') {
          await markAcked({ setup_notifications_ack_at: new Date().toISOString() });
        }
        await refreshProfile();
        setBusy(false);
        return;
      }
      await refreshProfile();
    }
    await markAcked({ setup_notifications_ack_at: new Date().toISOString() });
    setBusy(false);
  };

  // ── Privacy and comfort ───────────────────────────────────────────────────
  // Both buttons ack. This card asks for nothing the app needs, so "Not now"
  // has to be a real answer — a card that reappears after being declined is a
  // nag, and this audience is being nagged by enough already.
  const ackPreferences = () => markAcked({ setup_preferences_ack_at: new Date().toISOString() });

  // ── Mind domains ──────────────────────────────────────────────────────────
  const [pickedDomains, setPickedDomains] = useState<DomainType[]>([]);

  const saveDomains = async () => {
    if (!user || busy || pickedDomains.length < 2) return;
    setBusy(true);
    setError(null);

    // Baselines first, domains second. A non-empty active_domains is what marks
    // this card done (use-setup-cards.ts), so writing it first meant a failed
    // baseline seed still hid the card on the next refresh, with no baselines.
    //
    // Neutral seed rows rather than asked-for numbers. Every read of a baseline
    // falls back to the scale midpoint anyway, but a real row means nothing
    // downstream has to care whether one exists, and the weekly rolling recalc
    // (which is append-only, and expects a prior row) takes over from day 14.
    // baselines.source is the baseline_source enum in production — only
    // 'onboarding', 'rolling_median' and 'manual_reset' exist.
    const { error: baselineError } = await seedBaselines(user.id, pickedDomains, 5, 'onboarding');
    if (baselineError) { setError('Could not set up your baselines. Try again.'); setBusy(false); return; }

    const { error: settingsError } = await saveCheckInSettings(user.id, { active_domains: pickedDomains });
    if (settingsError) { setError('Could not save your domains. Try again.'); setBusy(false); return; }

    await scheduleTodayIfReady(!state.needsTimes);
    setBusy(false);
    setSheet(null);
    onChanged();
  };

  // ── Opting out of body or cycle ───────────────────────────────────────────
  // The same switch as Settings › Body tracking / Cycle tracking. Turning it
  // off is what retires the card: use-setup-cards only asks while it's on.
  // Anything already logged is kept.
  const optOut = async (kind: OptOut) => {
    if (!user) return;
    const { error: e } = await saveProfile(user.id, { [OPT_OUT_COPY[kind].field]: false });
    if (e) { setError('Could not save that. Try again.'); return; }
    if (Platform.OS === 'ios') pendingConfirm.current = kind;
    else setConfirm(kind);
    setSheet(null);
    await refreshProfile();
    onChanged();
  };
  const onSheetDismissed = () => {
    if (pendingConfirm.current) {
      setConfirm(pendingConfirm.current);
      pendingConfirm.current = null;
    }
  };

  const cardsReady = !state.loading && state.anyCardVisible;
  const showPreferences = cardsReady && current === null && state.needsPreferences;

  return (
    <View style={(cardsReady && (current || showPreferences)) ? styles.stack : undefined}>
      {cardsReady && current && (
        <>
          <View style={styles.progress}>
            <View style={styles.progressMeta}>
              <Text style={styles.progressLabel}>GETTING STARTED</Text>
              <Text style={styles.progressLabel}>{done + 1} OF {total}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.round(((done + 0.5) / total) * 100)}%`, backgroundColor: accent.text }]} />
            </View>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}

          {current === 'domains' && (
            <SetupCard
              title="What do you want to track?"
              body="Pick 2 to 8. Your check-ins only ever ask about these."
              action="Choose domains"
              onPress={() => { setPickedDomains([]); setError(null); setSheet('domains'); }}
            />
          )}

          {current === 'times' && (
            <SetupCard
              title="When should check-ins happen?"
              body="Your waking hours, and how many check-ins a day. All changeable later."
              action="Set my hours"
              onPress={() => { setError(null); setSheet('times'); }}
            />
          )}

          {current === 'notifications' && (
            <SetupCard
              title="Turn on reminders"
              body="Symetric nudges you at different times during your chosen hours, so we need to be able to send you notifications."
              action={busy ? 'Working…' : 'Turn on'}
              onPress={() => handleNotifications(true)}
              onSecondary={() => handleNotifications(false)}
              secondaryLabel="Not now"
            />
          )}

          {current === 'body' && (
            <SetupCard
              tone="body"
              title="Set up body tracking"
              body="Choose which physical symptoms to track, and when to be asked."
              action="Set up Body"
              onPress={() => { setError(null); setSheet('body'); }}
            />
          )}

          {current === 'cycle' && (
            <SetupCard
              title="Know when your last period started?"
              body="Recording it means day counts work straight away, instead of waiting for your next one."
              action="Add it"
              onPress={() => { setError(null); setSheet('cycle'); }}
            />
          )}
        </>
      )}

      {/* Last, and only once every step is done. It asks for nothing the app
          needs in order to work. */}
      {showPreferences && (
        <SetupCard
          title="Lock it, or quieten it"
          body="A PIN to open Symetric, and a mode that takes the brightness and the countdowns out of it. Both optional, both changeable later."
          action="Take a look"
          onPress={() => setSheet('preferences')}
          onSecondary={ackPreferences}
          secondaryLabel="Not now"
        />
      )}

      {/* ── Sheets ───────────────────────────────────────────────────────── */}

      <Modal visible={sheet === 'domains'} animationType="slide" onRequestClose={() => setSheet(null)}>
        <DomainSelectionStep
          selectedDomains={pickedDomains}
          onUpdate={setPickedDomains}
          onNext={saveDomains}
          onClose={() => setSheet(null)}
          stepLabel={stepLabel}
          progress={progress}
          error={error}
          saving={busy}
        />
      </Modal>

      <Modal visible={sheet === 'times'} animationType="slide" onRequestClose={() => setSheet(null)}>
        <TimesSheet
          stepLabel={stepLabel}
          progress={progress}
          onClose={() => setSheet(null)}
          onSaved={async () => {
            await scheduleTodayIfReady(!state.needsMindDomains);
            setSheet(null);
            onChanged();
          }}
          onError={setError}
        />
      </Modal>

      <Modal visible={sheet === 'body'} animationType="slide" onRequestClose={() => setSheet(null)} onDismiss={onSheetDismissed}>
        {sheet === 'body' && (
          <BodySetupFlow
            timeFormat={state.timeFormat}
            mindWindow={{ start: state.windowStart, end: state.windowEnd }}
            mindPerDay={state.checkInsPerDay}
            onClose={() => setSheet(null)}
            onDone={() => { setSheet(null); onChanged(); }}
            onOptOut={() => optOut('body')}
          />
        )}
      </Modal>

      <Modal visible={sheet === 'cycle'} animationType="slide" onRequestClose={() => setSheet(null)} onDismiss={onSheetDismissed}>
        {sheet === 'cycle' && (
          <CycleDayOneScreen
            onClose={() => setSheet(null)}
            onSaved={() => { setSheet(null); onChanged(); }}
            onOptOut={() => optOut('cycle')}
          />
        )}
      </Modal>

      <Modal visible={sheet === 'preferences'} animationType="slide" onRequestClose={() => setSheet(null)}>
        <ScrollView contentContainerStyle={[styles.sheet, { paddingTop: sheetPaddingTop }]}>
          <Text style={styles.sheetTitle}>Lock it, or quieten it</Text>

          <View style={styles.sheetToggleRow}>
            <Text style={styles.sheetToggleLabel}>App lock</Text>
            <Toggle
              value={profile?.app_lock_enabled ?? false}
              onValueChange={async on => {
                if (on) { setPinSheet(true); return; }
                try { await appLock.disable(); } catch { setError('Could not turn that off. Try again.'); }
              }}
            />
          </View>
          <Text style={styles.sheetHelper}>
            A {PIN_LENGTH}-digit PIN every time you open the app. Worth it if your phone is ever handed around —
            what you log here is the kind of thing you choose who sees.
          </Text>

          <View style={styles.sheetToggleRow}>
            <Text style={styles.sheetToggleLabel}>Comfort mode</Text>
            <Toggle value={comfort.standing} onValueChange={on => comfort.setStanding(on)} />
          </View>
          <Text style={styles.sheetHelper}>
            One quiet colour, larger check-in text, no countdown. Leave it off if you like — there is a button on
            this screen, top right, that turns it on for a couple of hours whenever a day calls for it.
          </Text>

          <View style={styles.sheetToggleRow}>
            <Text style={styles.sheetToggleLabel}>Pause reminders with it</Text>
            <Toggle value={comfort.pausesReminders} onValueChange={comfort.setPausesReminders} />
          </View>
          <Text style={styles.sheetHelper}>
            Applies to the two-hour and rest-of-today versions from that button, not the switch above. Off means
            the app still nudges you on a bad day — some people want the quiet, others would rather not lose the day
            from their record.
          </Text>
          {comfort.error && <Text style={styles.error}>{comfort.error}</Text>}

          <Pressable onPress={async () => { await ackPreferences(); setSheet(null); }}
            style={({ pressed }) => [styles.sheetSave, pressed && styles.pressed]}>
            <Text style={styles.sheetSaveText}>Done</Text>
          </Pressable>
        </ScrollView>

        {/* Inside this Modal, not beside it. Two sibling Modals visible at once
            is undefined on Android; a Modal rendered within another Modal's
            children is the supported way to stack them. */}
        {pinSheet && (
          <AppLockPinSheet
            mode="enable"
            onClose={() => setPinSheet(false)}
            onSetPin={async pin => {
              try { await appLock.setPin(pin); } catch { setError('Could not set your PIN. Try again.'); }
            }}
            onDisable={async () => {
              try { await appLock.disable(); } catch { setError('Could not turn that off. Try again.'); }
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm ? OPT_OUT_COPY[confirm].title : ''}
        body="You can turn it on or off in Settings at any time."
        onDone={() => setConfirm(null)}
      />
    </View>
  );
}

/**
 * Saves the times step and stamps its card done.
 *
 * The clock format isn't asked any more: it's taken from the phone and saved,
 * so every time shown afterwards matches what she's used to. Settings can
 * still change it. Quiet hours write their times only when set, matching
 * settings.tsx's handleToggleDND — dnd_start_time and dnd_end_time are
 * nullable and the edge function reads them as a pair.
 */
function TimesSheet({ stepLabel, progress, onClose, onSaved, onError }: {
  stepLabel: string; progress: number; onClose: () => void; onSaved: () => void | Promise<void>; onError: (m: string) => void;
}) {
  const { user } = useAuth();
  // Seeded as a confirm, not a blank form: three a day between 09:00 and 21:00.
  const [perDay, setPerDay] = useState(3);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('21:00');
  const [quiet, setQuiet] = useState<TimeRange | null>(null);
  const [saving, setSaving] = useState(false);
  const [timeFormat] = useState(deviceTimeFormat);

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await saveCheckInSettings(user.id, {
      check_ins_per_day: perDay,
      window_start: start,
      window_end: end,
      time_format: timeFormat,
      dnd_enabled: quiet !== null,
      dnd_start_time: quiet ? `${quiet.start}:00` : null,
      dnd_end_time: quiet ? `${quiet.end}:00` : null,
      setup_times_confirmed_at: new Date().toISOString(),
    });
    if (error) { onError('Could not save your hours. Try again.'); setSaving(false); return; }
    await onSaved();
    setSaving(false);
  };

  return (
    <CheckInPreferencesStep
      checkInsPerDay={perDay}
      windowStart={start}
      windowEnd={end}
      timeFormat={timeFormat}
      quiet={quiet}
      onUpdate={u => {
        if (u.checkInsPerDay !== undefined) setPerDay(u.checkInsPerDay);
        if (u.windowStart !== undefined) setStart(u.windowStart);
        if (u.windowEnd !== undefined) setEnd(u.windowEnd);
        if (u.quiet !== undefined) setQuiet(u.quiet);
      }}
      onNext={save}
      onClose={onClose}
      stepLabel={stepLabel}
      progress={progress}
      saving={saving}
    />
  );
}

const useStyles = makeAccentStyles(b => ({
  stack: { gap: 12, marginBottom: 24 },
  error: { fontSize: 13, color: '#f87171', lineHeight: 19 },

  progress: { gap: 8 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 11, color: '#8892a4', fontWeight: '600', letterSpacing: 0.8 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: '#1e2533', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  card: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderLeftWidth: 3, borderRadius: 12, padding: 16, gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  cardBody: { fontSize: 13.5, color: '#8892a4', lineHeight: 20 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  cardButton: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: b.fill },
  cardButtonText: { fontSize: 14, fontWeight: '600', color: b.onFill },
  cardSecondary: { fontSize: 13, color: '#6b7a99' },
  pressed: { opacity: 0.7 },

  // paddingTop comes from useModalTopPadding.
  sheet: { padding: 24, paddingBottom: 60, gap: 10, backgroundColor: '#0a0c12', flexGrow: 1 },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: '#e2e8f0', marginBottom: 12 },
  sheetToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 22,
  },
  sheetToggleLabel: { fontSize: 15, color: '#e2e8f0', fontWeight: '500' },
  sheetHelper: { fontSize: 13, color: '#8892a4', lineHeight: 19, marginTop: 6 },
  sheetSave: { marginTop: 28, backgroundColor: b.fill, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetSaveText: { fontSize: 15, fontWeight: '600', color: b.onFill },
}));
