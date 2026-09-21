import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { BRAND } from '@/constants/brand';

// Ported from the web app's src/hooks/usePushNotifications.ts — but this is
// a mechanic swap, not a line-for-line port. Web subscribes to the browser's
// Web Push Protocol (VAPID, a service worker, p256dh/auth encryption keys,
// endpoint rotation recovery via a SW cache flag) — none of that exists on
// native. Expo's push service issues one opaque "Expo push token" per
// device via getExpoPushTokenAsync(), no encryption keys or service worker
// to manage, and Expo's own SDK/backend handles APNs/FCM token rotation
// internally — so most of usePushNotifications.ts's syncPushSubscription()
// (endpoint-loss recovery, 410/404 stale-row cleanup, cache-flag bookkeeping)
// has no native equivalent to port at all, not just a smaller one.
//
// Tokens are stored in a new expo_push_tokens table (not push_subscriptions,
// which stays exactly as-is for web — see the migration this chunk adds),
// upserted by token (one row per device, same "each device keeps its own
// row" intent as web's per-endpoint upsert).

export type PushSubscribeResult =
  | { success: true }
  | { success: false; reason: 'unsupported' | 'blocked' | 'denied' | 'error'; message: string };

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Whether the OS will currently deliver a push to this app.
 *
 * The root `status` is not the whole answer on iOS, and Expo's own docs say
 * so: provisional authorisation (quiet delivery, granted without a prompt)
 * and ephemeral authorisation both deliver notifications while reporting
 * something other than 'granted' at the top level. Reading only the root
 * field would have the sync below conclude that permission had been revoked
 * and switch the user's reminders off for them.
 */
function isPermissionGranted(perms: Notifications.NotificationPermissionsStatus): boolean {
  if (perms.status === 'granted') return true;
  const iosStatus = perms.ios?.status;
  return iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED
    || iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL
    || iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

/** Android requires a notification channel before a push can display with
 *  the right importance/sound — no web equivalent, this is a native-only
 *  setup step. Safe to call repeatedly (idempotent). iOS ignores it. */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // HIGH, not DEFAULT: a check-in expires thirty minutes after it comes due,
  // so a reminder that lands silently in the shade is usually a missed
  // check-in. HIGH gets a heads-up banner. Android ignores importance changes
  // to a channel that already exists — this only affects installs that have
  // not created it yet, and can't quietly downgrade anyone.
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Check-in reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    // The DEFAULT accent, deliberately. Android fixes a channel's properties
    // when it is created and ignores later changes, so this cannot follow a
    // preference the user has not made yet -- and it is the notification LED,
    // which is not worth deleting and recreating a channel over (that would
    // reset the user's own per-channel sound and importance choices).
    lightColor: BRAND.text,
  });
}

export async function subscribeToPushNotifications(userId: string): Promise<PushSubscribeResult> {
  if (!Device.isDevice) {
    return { success: false, reason: 'unsupported', message: 'Push notifications require a physical device.' };
  }

  const existing = await Notifications.getPermissionsAsync();

  if (existing.status === 'denied') {
    return {
      success: false,
      reason: 'blocked',
      message: 'Notifications are blocked. Enable them for Symetric in your device Settings, then try again.',
    };
  }

  // Re-reading through isPermissionGranted rather than comparing the root
  // status directly — see its comment for the iOS authorisation states that
  // deliver notifications without reporting 'granted'.
  const final = isPermissionGranted(existing) ? existing : await Notifications.requestPermissionsAsync();

  if (!isPermissionGranted(final)) {
    await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId);
    return { success: false, reason: 'denied', message: 'Notification permission was not granted.' };
  }

  const projectId = getProjectId();
  if (!projectId) {
    return { success: false, reason: 'error', message: 'Push notifications aren’t set up for this build yet.' };
  }

  try {
    await ensureAndroidNotificationChannel();

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, reason: 'error', message: 'Session expired. Please sign out and sign in again.' };
    }

    // Upsert keyed by token — each device has its own token, so this adds/
    // updates only the current device's row without touching the user's
    // other devices, same intent as web's per-endpoint upsert.
    const { error: upsertError } = await supabase.from('expo_push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS },
      { onConflict: 'token' },
    );
    if (upsertError) {
      return { success: false, reason: 'error', message: 'Failed to save your push token. Please try again.' };
    }

    const { error: profileError } = await supabase.from('profiles').update({ push_enabled: true }).eq('id', userId);
    if (profileError) {
      return { success: false, reason: 'error', message: 'Failed to update notification preference. Please try again.' };
    }

    return { success: true };
  } catch {
    return { success: false, reason: 'error', message: 'An unexpected error occurred. Please try again.' };
  }
}

export type PushTokenSyncResult = 'synced' | 'permission_revoked' | 'unsupported' | 'error';

/**
 * Re-registers this device's Expo push token when the user already has push
 * enabled. Called on every launch — see hooks/use-push-token-sync.ts.
 *
 * Nothing did this before. The token was written once, when the Settings
 * toggle or the setup card was tapped, and never looked at again. An Expo
 * token is not stable for the life of an install: it changes on reinstall, on
 * "clear app data", on a restore to a new device, and when the underlying
 * FCM/APNs registration rotates. Each of those left a dead token in
 * expo_push_tokens with profiles.push_enabled still true — so the app said
 * reminders were on, the send path found a row to send to, and nothing
 * arrived. Toggling notifications off and on was the only cure, which is
 * precisely what the test-notification error told people to do.
 *
 * It reconciles the other direction too: if notification permission has since
 * been revoked in the OS (one tap on Android 13+), push_enabled goes back to
 * false, so Settings shows the true state and offers the prompt again instead
 * of claiming reminders are on while the OS drops them.
 */
export async function syncPushToken(userId: string): Promise<PushTokenSyncResult> {
  if (!Device.isDevice) return 'unsupported';

  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!isPermissionGranted(perms)) {
      await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId);
      return 'permission_revoked';
    }

    const projectId = getProjectId();
    if (!projectId) return 'error';

    // Must precede getExpoPushTokenAsync on Android: the channel is what the
    // OS attaches an incoming push to.
    await ensureAndroidNotificationChannel();

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.from('expo_push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS },
      { onConflict: 'token' },
    );
    if (error) {
      console.error('[push] token sync upsert failed:', error);
      return 'error';
    }
    return 'synced';
  } catch (e) {
    console.error('[push] token sync failed:', e);
    return 'error';
  }
}

export async function unsubscribeFromPushNotifications(userId: string): Promise<void> {
  try {
    const projectId = getProjectId();
    if (projectId && Device.isDevice) {
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      await supabase.from('expo_push_tokens').delete().eq('token', token);
    }
  } catch {
    // Best-effort — the row is orphaned but harmless (the send path skips
    // tokens Expo's receipt API reports as invalid) if this fails.
  }

  await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId);
}
