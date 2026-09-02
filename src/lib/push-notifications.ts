import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

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

/** Android requires a notification channel before a push can display with
 *  the right importance/sound — no web equivalent, this is a native-only
 *  setup step. Safe to call repeatedly (idempotent). iOS ignores it. */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#818cf8',
  });
}

export async function subscribeToPushNotifications(userId: string): Promise<PushSubscribeResult> {
  if (!Device.isDevice) {
    return { success: false, reason: 'unsupported', message: 'Push notifications require a physical device.' };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'denied') {
    return {
      success: false,
      reason: 'blocked',
      message: 'Notifications are blocked. Enable them for Symetric in your device Settings, then try again.',
    };
  }

  let finalStatus: Notifications.PermissionStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
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
