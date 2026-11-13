import AsyncStorage from '@react-native-async-storage/async-storage';
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

// This device's token as last registered. Kept so the token row can be found
// again without asking Expo — which needs the network, and which a device
// whose permission has gone may not answer usefully.
const DEVICE_TOKEN_KEY = 'symetric.push.deviceToken';

async function readStoredDeviceToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function forgetStoredDeviceToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Only a cache.
  }
}

/** The stored token, else Expo's answer within four seconds, else null. */
async function resolveThisDeviceToken(projectId: string): Promise<string | null> {
  const stored = await readStoredDeviceToken();
  if (stored) return stored;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }).then(t => t.data),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 4000); }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Gets this device's Expo token and stores it against the user, one row per
 * device (upserted by token). Shared by the explicit subscribe and the launch
 * sync. Returns false if the row could not be written.
 */
async function registerThisDevice(userId: string, projectId: string): Promise<boolean> {
  // The channel is what Android attaches an incoming push to; it is created at
  // launch too (use-push-token-sync), this just guarantees it on this path.
  await ensureAndroidNotificationChannel();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.from('expo_push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS },
    { onConflict: 'token' },
  );
  if (error) {
    console.error('[push] token upsert failed:', error);
    return false;
  }
  try {
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // Only a cache; resolveThisDeviceToken falls back to asking Expo.
  }
  return true;
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

/**
 * Takes this device out of the send list because it cannot show a push, and
 * switches the account's push_enabled off only if no other device is still
 * registered. Returns true when it switched it off.
 *
 * push_enabled belongs to the account; permission belongs to one device.
 * Turning the account off whenever *this* device lacked permission meant that
 * signing in on a second phone, before allowing notifications there, silently
 * stopped reminders on the first one.
 */
async function dropThisDevice(userId: string): Promise<boolean> {
  const projectId = getProjectId();
  const token = projectId ? await resolveThisDeviceToken(projectId) : await readStoredDeviceToken();
  if (token) {
    const { error } = await supabase.from('expo_push_tokens').delete().eq('token', token);
    if (!error) await forgetStoredDeviceToken();
  }

  const { count, error } = await supabase
    .from('expo_push_tokens')
    .select('token', { count: 'exact', head: true })
    .eq('user_id', userId);
  // Unknown is not "none": leave the account alone and try again next time.
  if (error || count === null || count > 0) return false;

  await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId);
  return true;
}

export async function subscribeToPushNotifications(userId: string): Promise<PushSubscribeResult> {
  if (!Device.isDevice) {
    return { success: false, reason: 'unsupported', message: 'Push notifications require a physical device.' };
  }

  // All of it inside the try: a permission call that throws used to escape,
  // and the callers' busy flags were never cleared.
  try {
    const existing = await Notifications.getPermissionsAsync();

    // canAskAgain, not status alone: Android reports 'denied' after a single
    // "Don't allow" yet still lets the app show the prompt again. Only when
    // the OS won't ask any more is device Settings the user's only way back.
    if (existing.status === 'denied' && !existing.canAskAgain) {
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
      await dropThisDevice(userId);
      return { success: false, reason: 'denied', message: 'Notification permission was not granted.' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { success: false, reason: 'error', message: 'Push notifications aren’t set up for this build yet.' };
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, reason: 'error', message: 'Session expired. Please sign out and sign in again.' };
    }

    if (!(await registerThisDevice(userId, projectId))) {
      return { success: false, reason: 'error', message: 'Failed to save your push token. Please try again.' };
    }

    const { error: profileError } = await supabase.from('profiles').update({ push_enabled: true }).eq('id', userId);
    if (profileError) {
      return { success: false, reason: 'error', message: 'Failed to update notification preference. Please try again.' };
    }

    return { success: true };
  } catch (e) {
    console.error('[push] subscribe failed:', e);
    return { success: false, reason: 'error', message: 'An unexpected error occurred. Please try again.' };
  }
}

/** 'permission_revoked': this device can't show pushes and was the last one
 *  registered, so the account's push_enabled was switched off.
 *  'not_permitted_here': this device can't show pushes and was dropped, but
 *  another device still has them, so the account was left alone. */
export type PushTokenSyncResult = 'synced' | 'permission_revoked' | 'not_permitted_here' | 'unsupported' | 'error';

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
 * been revoked in the OS (one tap on Android 13+), this device's row goes, and
 * if it was the last one push_enabled goes back to false, so Settings shows
 * the true state and offers the prompt again instead of claiming reminders
 * are on while the OS drops them. See dropThisDevice for why a device without
 * permission doesn't switch the whole account off.
 */
export async function syncPushToken(userId: string): Promise<PushTokenSyncResult> {
  if (!Device.isDevice) return 'unsupported';

  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!isPermissionGranted(perms)) {
      return (await dropThisDevice(userId)) ? 'permission_revoked' : 'not_permitted_here';
    }

    const projectId = getProjectId();
    if (!projectId) return 'error';

    return (await registerThisDevice(userId, projectId)) ? 'synced' : 'error';
  } catch (e) {
    console.error('[push] token sync failed:', e);
    return 'error';
  }
}

/**
 * Deletes this device's row from expo_push_tokens. Best-effort and bounded:
 * the stored token needs no network, and asking Expo for it is capped at four
 * seconds, so sign-out can't hang on it. If it fails the row is orphaned; the
 * send path drops tokens Expo reports as invalid.
 */
export async function removeThisDevicePushToken(): Promise<void> {
  const projectId = getProjectId();
  if (!projectId || !Device.isDevice) return;
  try {
    const token = await resolveThisDeviceToken(projectId);
    if (token) {
      const { error } = await supabase.from('expo_push_tokens').delete().eq('token', token);
      if (!error) await forgetStoredDeviceToken();
    }
  } catch {
    // See above.
  }
}

export async function unsubscribeFromPushNotifications(userId: string): Promise<void> {
  await removeThisDevicePushToken();
  await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId);
}
