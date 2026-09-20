import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BodyTrackingSheet from '@/components/body/body-tracking-sheet';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import AppLockPinSheet from '@/components/settings/app-lock-pin-sheet';
import { DeleteAllSheet, DeleteRangeSheet, ExportSheet, ResetBaselineSheet } from '@/components/settings/data-sheets';
import {
  BellIcon, BellSlashIcon, BodyIcon, BrainIcon, CalendarIcon, ClockIcon, ClockSimpleIcon,
  CycleIcon, DownloadIcon, LockIcon, PaperPlaneIcon, RefreshIcon, XDangerIcon,
  EyeIcon,
} from '@/components/settings/settings-icons';
import {
  ChevronRight, InlineMessage, RowValue, SectionCard, SectionLabel, SettingsRow, RowDivider,
  Toast, Toggle,
} from '@/components/settings/settings-primitives';
import {
  ActiveWindowSheet, BaselineModal, ConfirmDisableSheet, DndSheet, FrequencySheet,
  TimeFormatSheet,
} from '@/components/settings/settings-sheets';
import AppLogoHeader from '@/components/shared/app-logo-header';
import { useAuth } from '@/contexts/auth-context';
import { useAppLockSettings } from '@/hooks/use-app-lock-settings';
import { useBodyTrackingSettings } from '@/hooks/use-body-tracking-settings';
import {
  BODY_DOMAINS, CHECKIN_BODY_DOMAIN_ORDER, MORNING_CAPABLE_DOMAIN_ORDER, MORNING_DOMAIN_LIMIT,
} from '@/lib/body/constants';
import { useComfort } from '@/hooks/use-comfort';
import { resolveActiveDomains } from '@/lib/domains';
import { subscribeToPushNotifications, syncPushToken, unsubscribeFromPushNotifications } from '@/lib/push-notifications';
import { ALL_DOMAINS, MIN_DOMAINS } from '@/lib/settings-domains';
import type { BodyDomainType, CheckInSettings, DomainType, Profile } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { formatWindowTime, type TimeFormat } from '@/lib/time-format';
import { BRAND, brandTint } from '@/constants/brand';

// Rebuilt against the web app's SettingsScreen.tsx. This screen previously
// carried four of its controls (markers, body tracking, app lock, push) in a
// marker FlatList with hand-rolled rows in its footer — no sections, no shared
// row layout, and none of Mind tracking, cycle tracking, do not disturb,
// comfort mode, time format, export, delete a date range,
// reset baselines or delete account, all of which shipped to the stores
// missing.
//
// The Markers section is gone rather than ported: the web app has never had
// one here, and marker CRUD already lives on Prepare's notable-changes-section
// (and Today's "+ Add an event") natively, so nothing is lost by matching.
//
// Not ported: the domain suggestion cards (an additive prompt, not a control),
// haptic feedback (needs expo-haptics, which this app doesn't depend on yet),
// and the dev-only push diagnostics panel. The Mind Tracking row's full-screen
// domain sheet is also absent — the pills under it toggle the same domains,
// which is what the web sheet does, so the row is a label here rather than a
// dead tap target.

type SheetType = 'activeWindow' | 'frequency' | 'bodyTracking' | 'dnd' | 'timeFormat'
  | 'export' | 'deleteRange' | 'deleteAll' | 'resetBaseline' | null;

/**
 * Turns a failed send-test-notification call into something that says what
 * went wrong. It used to read "Failed to send. Try toggling notifications off
 * and on." for every possible cause — a device that was never registered, a
 * token the push service has retired, missing FCM/APNs credentials on the
 * server, and a plain network drop all produced the same sentence, and only
 * one of them was fixable by toggling anything.
 *
 * supabase-js reports a non-2xx response as a FunctionsHttpError whose
 * `context` is the raw Response, so the function's own error code is only
 * reachable by reading that body.
 */
async function describeTestFailure(error: unknown): Promise<string> {
  let code = '';
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      code = String(body?.error ?? '');
    } catch {
      // Non-JSON body (a gateway error page, say) — fall through to the
      // generic message below rather than showing HTML to the user.
    }
  }

  if (code === 'no_subscription') {
    return 'This device isn’t registered for notifications. Turn Push notifications off, then on again.';
  }
  if (code === 'DeviceNotRegistered' || code === 'subscription_expired') {
    return 'This device’s registration has expired. Turn Push notifications off, then on again.';
  }
  if (code === 'InvalidCredentials' || code === 'MismatchSenderId') {
    // Nothing the user can do — the app's own push credentials are wrong.
    return `Notifications aren’t set up correctly for this build (${code}). This needs fixing in the app, not on your device.`;
  }
  if (code === 'MessageRateExceeded') {
    return 'Too many test notifications just now. Wait a minute and try again.';
  }
  if (code) return `Failed to send: ${code}`;
  return 'Failed to send. Check your connection and try again.';
}

function DomainPills({ activeDomains, onToggle }: { activeDomains: DomainType[]; onToggle: (d: DomainType) => void }) {
  return (
    <View style={styles.pillRow}>
      {ALL_DOMAINS.map(d => {
        const active = activeDomains.includes(d.type);
        return (
          <Pressable key={d.type} onPress={() => onToggle(d.type)} style={[styles.pill, active && styles.pillActive]}>
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{d.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Which domains the morning check-in asks about.
 *
 * Offered from the evening list rather than from every domain: a morning
 * reading is worth having because it contrasts with an evening one. Capped, so
 * the form someone answers newly awake stays short — past the cap the unchosen
 * pills go flat and stop responding rather than silently swapping a choice out.
 */
function MorningDomainPills({ activeDomains, morningDomains, onToggle }: {
  activeDomains: BodyDomainType[];
  morningDomains: BodyDomainType[];
  onToggle: (d: BodyDomainType) => void;
}) {
  const atLimit = morningDomains.length >= MORNING_DOMAIN_LIMIT;
  const offered = MORNING_CAPABLE_DOMAIN_ORDER.filter(d => activeDomains.includes(d));
  return (
    <View style={styles.pillRow}>
      {offered.map(d => {
        const active = morningDomains.includes(d);
        const disabled = !active && atLimit;
        return (
          <Pressable
            key={d}
            onPress={() => onToggle(d)}
            disabled={disabled}
            style={[styles.pill, active && styles.pillActiveBody, disabled && styles.pillDisabled]}>
            <Text style={[styles.pillText, active && styles.pillTextActiveBody]}>{BODY_DOMAINS[d].label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BodyDomainPills({ activeDomains, onToggle }: { activeDomains: BodyDomainType[]; onToggle: (d: BodyDomainType) => void }) {
  return (
    <View style={styles.pillRow}>
      {CHECKIN_BODY_DOMAIN_ORDER.filter(d => !BODY_DOMAINS[d].required).map(d => {
        const active = activeDomains.includes(d);
        return (
          <Pressable key={d} onPress={() => onToggle(d)} style={[styles.pill, active && styles.pillActiveBody]}>
            <Text style={[styles.pillText, active && styles.pillTextActiveBody]}>{BODY_DOMAINS[d].label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const comfort = useComfort();
  const appLock = useAppLockSettings();
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkInSettings, setCheckInSettings] = useState<CheckInSettings | null>(null);
  const [activeDomains, setActiveDomains] = useState<DomainType[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [sheet, setSheet] = useState<SheetType>(null);
  const [appLockSheetMode, setAppLockSheetMode] = useState<'enable' | 'disable' | 'change' | null>(null);
  const [pendingEnable, setPendingEnable] = useState<DomainType | null>(null);
  const [pendingDisable, setPendingDisable] = useState<DomainType | null>(null);

  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [showMoreExpanded, setShowMoreExpanded] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [testPushResult, setTestPushResult] = useState<{ ok: boolean; message: string } | null>(null);

  const {
    bodyDomainsActive, bodyAvailableFrom, bodyReminderTime, bodyMorningEnabled, bodyMorningTime,
    bodyMorningDomains, setBodyMorningEnabled, handleToggleBodyDomain, handleToggleMorningDomain,
    handleSaveBodyTiming,
  } = useBodyTrackingSettings(user?.id, profile, refreshProfile, {
    defaultDomains: CHECKIN_BODY_DOMAIN_ORDER,
    onError: setToastMessage,
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from('check_in_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (error) {
      console.error('[Settings] load error:', error);
      setLoadError('Failed to load settings. Pull down or reopen the tab to try again.');
      setLoading(false);
      return;
    }
    setCheckInSettings(data as CheckInSettings | null);
    setActiveDomains(resolveActiveDomains(data));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const timeFormat: TimeFormat = checkInSettings?.time_format ?? '12hr';
  const dndEnabled = checkInSettings?.dnd_enabled ?? false;
  const dndStartTime = checkInSettings?.dnd_start_time?.slice(0, 5) ?? '14:00';
  const dndEndTime = checkInSettings?.dnd_end_time?.slice(0, 5) ?? '16:00';

  // ── Mind domains ───────────────────────────────────────────────────────────

  const updateActiveDomains = async (next: DomainType[], prev: DomainType[]) => {
    if (!user) return;
    setActiveDomains(next);
    const { error } = await supabase.from('check_in_settings')
      .update({ active_domains: next, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) {
      setActiveDomains(prev);
      setToastMessage('Failed to save changes. Please try again.');
      return;
    }
    setCheckInSettings(p => (p ? { ...p, active_domains: next } : p));
  };

  const handleToggleDomain = async (domain: DomainType) => {
    if (!user) return;
    if (activeDomains.includes(domain)) {
      if (activeDomains.length <= MIN_DOMAINS) { setToastMessage('You must track at least 2 domains'); return; }
      setPendingDisable(domain);
      return;
    }
    // Turning a domain back on only needs a baseline if it has never had one —
    // otherwise the old one still applies and asking again would overwrite it.
    const { data: existing } = await supabase.from('baselines')
      .select('id').eq('user_id', user.id).eq('domain', domain).eq('is_current', true).limit(1);
    if (existing && existing.length > 0) await updateActiveDomains([...activeDomains, domain], activeDomains);
    else setPendingEnable(domain);
  };

  const handleConfirmDisable = async () => {
    if (!pendingDisable) return;
    await updateActiveDomains(activeDomains.filter(d => d !== pendingDisable), activeDomains);
    setPendingDisable(null);
  };

  const handleBaselineSubmit = async (score: number) => {
    if (!pendingEnable || !user) return;
    await supabase.from('baselines').update({ is_current: false })
      .eq('user_id', user.id).eq('domain', pendingEnable).eq('is_current', true);
    await supabase.from('baselines').insert({
      user_id: user.id, domain: pendingEnable, baseline_score: score, source: 'manual_reset', is_current: true,
    });
    await updateActiveDomains([...activeDomains, pendingEnable], activeDomains);
    setPendingEnable(null);
  };

  // ── Profile booleans ───────────────────────────────────────────────────────

  const toggleProfileField = async (field: keyof Profile, current: boolean, onOptimistic?: (v: boolean) => void) => {
    if (!user) return;
    const next = !current;
    onOptimistic?.(next);
    const { error } = await supabase.from('profiles').update({ [field]: next }).eq('id', user.id);
    if (error) {
      onOptimistic?.(current);
      setToastMessage('Failed to save changes. Please try again.');
      return;
    }
    await refreshProfile();
  };

  // ── check_in_settings fields ───────────────────────────────────────────────

  const handleSetTimeFormat = async (next: TimeFormat) => {
    if (!user || next === timeFormat) return;
    const prev = checkInSettings;
    setCheckInSettings(p => (p ? { ...p, time_format: next } : p));
    const { error } = await supabase.from('check_in_settings').update({ time_format: next }).eq('user_id', user.id);
    if (error) { setCheckInSettings(prev); setToastMessage('Failed to save changes. Please try again.'); }
  };

  const handleToggleDND = async (next: boolean) => {
    if (!user) return;
    const prev = checkInSettings;
    const patch = {
      dnd_enabled: next,
      dnd_start_time: next ? `${dndStartTime}:00` : null,
      dnd_end_time: next ? `${dndEndTime}:00` : null,
    };
    setCheckInSettings(p => (p ? { ...p, ...patch } : p));
    const { error } = await supabase.from('check_in_settings').update(patch).eq('user_id', user.id);
    if (error) { setCheckInSettings(prev); setToastMessage('Failed to save changes. Please try again.'); }
  };

  const handleDNDTimeChange = async (start: string, end: string) => {
    if (!user) return;
    const patch = { dnd_start_time: `${start}:00`, dnd_end_time: `${end}:00` };
    setCheckInSettings(p => (p ? { ...p, ...patch } : p));
    const { error } = await supabase.from('check_in_settings').update(patch).eq('user_id', user.id);
    if (error) setToastMessage('Failed to save times. Please try again.');
  };

  const handleSaveActiveWindow = async (start: string, end: string) => {
    if (!user) return;
    const { error } = await supabase.from('check_in_settings')
      .update({ window_start: start, window_end: end }).eq('user_id', user.id);
    if (error) throw error;
    setCheckInSettings(p => (p ? { ...p, window_start: start, window_end: end } : p));
  };

  const handleSaveFrequency = async (freq: number) => {
    if (!user) return;
    const { error } = await supabase.from('check_in_settings')
      .update({ check_ins_per_day: freq }).eq('user_id', user.id);
    if (error) throw error;
    setCheckInSettings(p => (p ? { ...p, check_ins_per_day: freq } : p));
  };

  // ── Notifications, security ────────────────────────────────────────────────

  const handleTogglePush = async (next: boolean) => {
    if (!user) return;
    setPushError(null);
    setPushBusy(true);
    if (next) {
      const result = await subscribeToPushNotifications(user.id);
      if (!result.success) setPushError(result.message);
    } else {
      await unsubscribeFromPushNotifications(user.id);
    }
    setPushBusy(false);
    await refreshProfile();
  };

  const handleSendTestNotification = async () => {
    if (!user || testingPush) return;
    setTestingPush(true);
    setTestPushResult(null);
    // Register this device's token first. A test that fails only because the
    // stored token is stale is the single most common way this reports a
    // problem the user cannot act on, and re-registering is what "toggle it
    // off and on" was really doing.
    await syncPushToken(user.id);
    const { error } = await supabase.functions.invoke('send-test-notification');
    setTestPushResult(error
      ? { ok: false, message: await describeTestFailure(error) }
      : { ok: true, message: 'Notification sent - check your device.' });
    setTestingPush(false);
  };

  const handleSetAppLockPin = async (pin: string) => {
    try {
      await appLock.setPin(pin);
      setToastMessage(appLockSheetMode === 'change' ? 'PIN updated' : 'App lock enabled');
    } catch {
      setToastMessage('Failed to save changes. Please try again.');
    }
  };

  const handleDisableAppLock = async () => {
    try {
      await appLock.disable();
    } catch {
      setToastMessage('Failed to save changes. Please try again.');
    }
  };

  if (loading) return <PulseLoadingScreen />;

  const bodyTrackingEnabled = profile?.body_tracking_enabled ?? false;
  const appLockEnabled = profile?.app_lock_enabled ?? false;
  const pushEnabled = profile?.push_enabled ?? false;
  const pendingDisableLabel = ALL_DOMAINS.find(d => d.type === pendingDisable)?.label;
  const pendingEnableLabel = ALL_DOMAINS.find(d => d.type === pendingEnable)?.label;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page}>
        <AppLogoHeader />
        <Text style={styles.heading}>Settings</Text>

        {loadError && (
          <View style={styles.loadError}><Text style={styles.loadErrorText}>{loadError}</Text></View>
        )}

        {/* ── Your tracking setup ─────────────────────────────────────────── */}
        <SectionLabel>Your tracking setup</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<BrainIcon />}
            label="Mind Tracking"
            subtitle={`${activeDomains.length} of ${ALL_DOMAINS.length} active`}
          />
          <DomainPills activeDomains={activeDomains} onToggle={handleToggleDomain} />
          <RowDivider />
          <SettingsRow
            icon={<ClockIcon />}
            label="Active window"
            subtitle={checkInSettings
              ? `${formatWindowTime(checkInSettings.window_start, timeFormat)} - ${formatWindowTime(checkInSettings.window_end, timeFormat)}`
              : undefined}
            right={<RowValue>Edit</RowValue>}
            onPress={() => setSheet('activeWindow')}
          />
          <RowDivider />
          <SettingsRow
            icon={<ClockSimpleIcon />}
            label="Mind check-ins per day"
            right={<RowValue>{checkInSettings?.check_ins_per_day ?? '-'}</RowValue>}
            onPress={() => setSheet('frequency')}
          />
        </SectionCard>

        {/* ── Body tracking ───────────────────────────────────────────────── */}
        <SectionLabel>Body tracking</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<BodyIcon />}
            label="Body tracking"
            subtitle="Fatigue, pain, and other physical symptoms"
            right={<Toggle value={bodyTrackingEnabled} onValueChange={() => toggleProfileField('body_tracking_enabled', bodyTrackingEnabled)} />}
          />
          {bodyTrackingEnabled && (
            <>
              <RowDivider />
              <BodyDomainPills activeDomains={bodyDomainsActive} onToggle={handleToggleBodyDomain} />
              <RowDivider />
              <SettingsRow
                icon={<ClockIcon />} label="Available from"
                subtitle={formatWindowTime(bodyAvailableFrom, timeFormat)}
                right={<RowValue>Edit</RowValue>} onPress={() => setSheet('bodyTracking')}
              />
              <RowDivider />
              <SettingsRow
                icon={<ClockSimpleIcon />} label="Remind me at"
                subtitle={formatWindowTime(bodyReminderTime, timeFormat)}
                right={<RowValue>Edit</RowValue>} onPress={() => setSheet('bodyTracking')}
              />
              <RowDivider />
              <SettingsRow
                icon={<BellIcon />} label="Morning check-in"
                subtitle="Optional: fatigue, pain, and dizziness, before the day starts"
                right={<Toggle value={bodyMorningEnabled} onValueChange={() => toggleProfileField('body_morning_enabled', bodyMorningEnabled, setBodyMorningEnabled)} />}
              />
              {bodyMorningEnabled && (
                <>
                  <RowDivider />
                  <SettingsRow
                    icon={<BodyIcon />}
                    label="What to ask in the morning"
                    subtitle={`${bodyMorningDomains.length} of ${MORNING_DOMAIN_LIMIT} · from the symptoms you already track`}
                  />
                  <MorningDomainPills
                    activeDomains={bodyDomainsActive}
                    morningDomains={bodyMorningDomains}
                    onToggle={handleToggleMorningDomain}
                  />
                  <RowDivider />
                  <SettingsRow
                    icon={<ClockIcon />} label="Opens at"
                    subtitle={formatWindowTime(bodyMorningTime, timeFormat)}
                    right={<RowValue>Edit</RowValue>} onPress={() => setSheet('bodyTracking')}
                  />
                </>
              )}
            </>
          )}
        </SectionCard>

        {/* ── Cycle tracking ──────────────────────────────────────────────── */}
        <SectionLabel>Cycle tracking</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<CycleIcon />}
            label="Cycle tracking"
            subtitle="Log Day 1 as an event, see the cycle day in History"
            right={<Toggle
              value={profile?.cycle_tracking_enabled ?? false}
              onValueChange={() => toggleProfileField('cycle_tracking_enabled', profile?.cycle_tracking_enabled ?? false)}
            />}
          />
        </SectionCard>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <SectionLabel>Notifications</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<BellSlashIcon />}
            label="Do not disturb"
            subtitle="Check-ins still appear when you open the app"
            right={<Toggle value={dndEnabled} onValueChange={() => handleToggleDND(!dndEnabled)} />}
          />
          {dndEnabled && (
            <>
              <RowDivider />
              <SettingsRow
                icon={<ClockIcon />} label="Do not disturb hours"
                subtitle={`${formatWindowTime(dndStartTime, timeFormat)} - ${formatWindowTime(dndEndTime, timeFormat)}`}
                right={<RowValue>Edit</RowValue>} onPress={() => setSheet('dnd')}
              />
            </>
          )}
          <RowDivider />
          <SettingsRow
            icon={<BellIcon />}
            label="Push notifications"
            subtitle="How Symetric reaches you for check-ins"
            right={<Toggle value={pushEnabled} onValueChange={handleTogglePush} disabled={pushBusy} />}
          />
          {pushError && <View style={styles.inlineWrap}><InlineMessage type="error">{pushError}</InlineMessage></View>}

          <Pressable onPress={() => setShowMoreExpanded(p => !p)} style={styles.showMore}>
            <Text style={styles.showMoreLabel}>Notification test</Text>
            <Text style={styles.showMoreAction}>{showMoreExpanded ? 'Hide ›' : 'Show ›'}</Text>
          </Pressable>

          {showMoreExpanded && (
            <>
              <RowDivider />
              <SettingsRow
                icon={<PaperPlaneIcon />} iconColor="slate"
                label="Send test notification"
                subtitle={pushEnabled ? 'Check that delivery is working on this device' : 'Enable push notifications first'}
                right={
                  <Pressable
                    onPress={handleSendTestNotification}
                    disabled={testingPush || !pushEnabled}
                    style={[styles.smallButton, (testingPush || !pushEnabled) && styles.smallButtonDisabled]}>
                    <Text style={[styles.smallButtonText, (testingPush || !pushEnabled) && styles.smallButtonTextDisabled]}>
                      {testingPush ? 'Sending...' : 'Send'}
                    </Text>
                  </Pressable>
                }
              />
              {testPushResult && (
                <View style={styles.inlineWrap}>
                  <InlineMessage type={testPushResult.ok ? 'info' : 'error'}>{testPushResult.message}</InlineMessage>
                </View>
              )}
            </>
          )}
        </SectionCard>

        {/* ── Security ────────────────────────────────────────────────────── */}
        <SectionLabel>Security</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<LockIcon />}
            label="App lock"
            subtitle="Require a PIN to open Symetric"
            right={<Toggle value={appLockEnabled} onValueChange={() => setAppLockSheetMode(appLockEnabled ? 'disable' : 'enable')} />}
          />
          {appLockEnabled && (
            <>
              <RowDivider />
              <SettingsRow
                icon={<LockIcon />} label="Change PIN"
                right={<ChevronRight />} onPress={() => setAppLockSheetMode('change')}
              />
            </>
          )}
        </SectionCard>

        {/* ── Preferences ─────────────────────────────────────────────────── */}
        <SectionLabel>Preferences</SectionLabel>
        <SectionCard>
          {/* The STANDING half of comfort mode. The in-the-moment half lives on
              Today, because being overstimulated is episodic — it is not a
              preference someone sets once, while calm, in anticipation of a bad
              hour they have not had yet. Both read profiles.comfort_mode /
              comfort_until through useComfort().

              This row deliberately does NOT mute reminder push; only an armed
              window from Today does. checkSustainedDeviationQuality rejects any
              window below 40% coverage or 1.5 check-ins/day, so a permanent
              mute would quietly starve detection until it stopped finding
              anything. See 20260918000001_comfort_mode_state.sql.

              Simplified colours used to be a second toggle directly below this
              one. It is now part of comfort mode rather than its own setting —
              see getDomainColorFromProfile. */}
          <SettingsRow
            icon={<EyeIcon />}
            label="Comfort mode"
            subtitle="One quiet colour, larger check-in text, no countdown"
            right={<Toggle
              value={comfort.standing}
              onValueChange={() => comfort.setStanding(!comfort.standing)}
            />}
          />
          <RowDivider />
          {/* Governs armed windows only — the standing toggle above has never
              muted anything. Default on, which is how comfort mode shipped;
              off is for people whose day only gets logged because the app
              asked. See 20260918000005_comfort_reminder_pref.sql. */}
          <SettingsRow
            icon={<BellSlashIcon />}
            label="Pause reminders in comfort mode"
            subtitle="Only while comfort mode is switched on from Today, for a couple of hours or the rest of the day"
            right={<Toggle
              value={comfort.pausesReminders}
              onValueChange={on => comfort.setPausesReminders(on)}
            />}
          />
          <RowDivider />
          <SettingsRow
            icon={<ClockSimpleIcon />}
            label="Time format"
            right={<RowValue>{timeFormat === '12hr' ? '12-hour' : '24-hour'}</RowValue>}
            onPress={() => setSheet('timeFormat')}
          />
        </SectionCard>

        {/* ── Your data ───────────────────────────────────────────────────── */}
        <SectionLabel>Your data</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<DownloadIcon />} label="Export my data"
            subtitle="CSV or JSON · your data, take it anytime"
            right={<ChevronRight />} onPress={() => setSheet('export')}
          />
          <RowDivider />
          <SettingsRow
            icon={<CalendarIcon />} label="Delete a date range"
            subtitle="Remove a specific period from your record"
            right={<ChevronRight />} onPress={() => setSheet('deleteRange')}
          />
          <RowDivider />
          <SettingsRow
            icon={<RefreshIcon />} label="Reset baselines"
            subtitle="Recalculate what's normal for you"
            right={<ChevronRight />} onPress={() => setSheet('resetBaseline')}
          />
        </SectionCard>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <SectionLabel danger>Account</SectionLabel>
        <SectionCard>
          <SettingsRow
            icon={<XDangerIcon />} danger
            label="Delete all data and account"
            subtitle="Permanent. Cannot be undone."
            right={<ChevronRight color="#b05050" />}
            onPress={() => setSheet('deleteAll')}
          />
        </SectionCard>

        <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      {/* ── Sheets ── */}
      {sheet === 'activeWindow' && checkInSettings && (
        <ActiveWindowSheet
          currentStart={checkInSettings.window_start}
          currentEnd={checkInSettings.window_end}
          timeFormat={timeFormat}
          onSave={handleSaveActiveWindow}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'frequency' && checkInSettings && (
        <FrequencySheet current={checkInSettings.check_ins_per_day} onSave={handleSaveFrequency} onClose={() => setSheet(null)} />
      )}
      {sheet === 'bodyTracking' && (
        <BodyTrackingSheet
          activeDomains={bodyDomainsActive}
          onToggleDomain={handleToggleBodyDomain}
          currentAvailableFrom={bodyAvailableFrom}
          currentReminderTime={bodyReminderTime}
          currentMorningEnabled={bodyMorningEnabled}
          currentMorningTime={bodyMorningTime}
          onSaveTiming={handleSaveBodyTiming}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'dnd' && (
        <DndSheet
          dndStartTime={dndStartTime} dndEndTime={dndEndTime} timeFormat={timeFormat}
          onTimeChange={handleDNDTimeChange} onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'timeFormat' && (
        <TimeFormatSheet current={timeFormat} onChange={handleSetTimeFormat} onClose={() => setSheet(null)} />
      )}
      {sheet === 'export' && <ExportSheet onClose={() => setSheet(null)} />}
      {sheet === 'deleteRange' && user && (
        <DeleteRangeSheet userId={user.id} onClose={() => setSheet(null)} onDeleted={() => setToastMessage('That period has been deleted.')} />
      )}
      {sheet === 'deleteAll' && <DeleteAllSheet onClose={() => setSheet(null)} />}
      {sheet === 'resetBaseline' && user && <ResetBaselineSheet userId={user.id} onClose={() => setSheet(null)} />}

      {appLockSheetMode && (
        <AppLockPinSheet
          mode={appLockSheetMode}
          currentPinHash={profile?.app_lock_pin_hash}
          currentPinSalt={profile?.app_lock_pin_salt}
          onClose={() => setAppLockSheetMode(null)}
          onSetPin={handleSetAppLockPin}
          onDisable={handleDisableAppLock}
        />
      )}

      {pendingDisable && pendingDisableLabel && (
        <ConfirmDisableSheet domainLabel={pendingDisableLabel} onConfirm={handleConfirmDisable} onClose={() => setPendingDisable(null)} />
      )}
      {pendingEnable && pendingEnableLabel && (
        <BaselineModal domainLabel={pendingEnableLabel} onSubmit={handleBaselineSubmit} onClose={() => setPendingEnable(null)} />
      )}

      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  page: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60 },
  pressed: { opacity: 0.7 },
  heading: { fontSize: 22, fontWeight: '600', color: '#e2e4ec', letterSpacing: -0.3, marginBottom: 4 },

  loadError: {
    backgroundColor: '#1a0e0e', borderWidth: 1, borderColor: '#3b1515',
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 16,
  },
  loadErrorText: { fontSize: 13, color: '#f87171' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  pill: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#1e2333', borderWidth: 1, borderColor: '#252b3b' },
  pillActive: { backgroundColor: brandTint(BRAND.textFlat, 0.15), borderColor: brandTint(BRAND.textFlat, 0.4) },
  pillDisabled: { opacity: 0.35 },
  pillActiveBody: { backgroundColor: 'rgba(188,129,47,0.15)', borderColor: 'rgba(188,129,47,0.4)' },
  pillText: { fontSize: 12, fontWeight: '500', color: '#555c72' },
  pillTextActive: { color: BRAND.textSoft },
  pillTextActiveBody: { color: '#BC812F' },

  inlineWrap: { paddingHorizontal: 16, paddingBottom: 14 },

  showMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#252b3b',
  },
  showMoreLabel: { fontSize: 13, color: '#8b90a4' },
  showMoreAction: { fontSize: 13, color: '#555c72' },

  smallButton: { paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: '#252b3b', borderRadius: 8 },
  smallButtonDisabled: { opacity: 0.6 },
  smallButtonText: { fontSize: 13, fontWeight: '500', color: '#8b90a4' },
  smallButtonTextDisabled: { color: '#555c72' },

  signOut: {
    marginTop: 8, paddingVertical: 14, backgroundColor: '#181c26',
    borderWidth: 1, borderColor: '#252b3b', borderRadius: 12, alignItems: 'center',
  },
  signOutText: { fontSize: 15, color: '#8b90a4' },
});
