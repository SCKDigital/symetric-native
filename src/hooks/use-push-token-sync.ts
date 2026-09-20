import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { ensureAndroidNotificationChannel, syncPushToken } from '@/lib/push-notifications';

/**
 * Keeps this device's stored Expo push token current for a user who has push
 * enabled. Mount once, at the app root.
 *
 * Three things happen here, none of which happened anywhere before:
 *
 * 1. The Android notification channel is created at launch, not only inside
 *    the Settings toggle. A device that was granted permission in a previous
 *    version, or restored from a backup, could reach a state where a push
 *    arrived with no channel to display it on.
 *
 * 2. The token is re-registered on launch and when the app is brought back to
 *    the foreground, so a token that rotated while the app was closed repairs
 *    itself instead of needing the notifications toggle flipped by hand. See
 *    syncPushToken's own comment for what rotates a token.
 *
 * 3. Expo's own push-token listener covers the rare case of a rotation while
 *    the app is running and foregrounded, which neither of the above catches.
 *
 * Deliberately does nothing when push is off: this must never be a back door
 * that re-registers a device the user has opted out on, and it never asks for
 * permission — that stays an explicit choice in Settings or the setup card.
 */
export function usePushTokenSync(
  userId: string | undefined,
  pushEnabled: boolean,
  /** Called when the sync has changed the profile — currently only when it
   *  finds permission revoked and switches push_enabled off, which Settings
   *  would otherwise keep showing as on until the next profile fetch. */
  onProfileChanged?: () => void,
) {
  // Held in a ref because the auth context rebuilds refreshProfile on every
  // render: as a dependency it would tear down and re-run the whole effect —
  // re-registering the token and re-subscribing the listeners — on each one.
  // Written in an effect rather than during render: this project builds with
  // the React Compiler, which rejects a ref write in the render body.
  const onProfileChangedRef = useRef(onProfileChanged);
  useEffect(() => {
    onProfileChangedRef.current = onProfileChanged;
  }, [onProfileChanged]);

  useEffect(() => {
    ensureAndroidNotificationChannel().catch(e => console.error('[push] channel setup:', e));
  }, []);

  useEffect(() => {
    if (!userId || !pushEnabled) return;

    let cancelled = false;
    let inFlight = false;
    let lastSyncedAt = 0;

    /** `force` skips the throttle — used for the launch sync and for a token
     *  Expo has just told us has rotated, where being current matters more
     *  than saving a write. */
    const sync = (force: boolean) => {
      if (cancelled || inFlight) return;
      // Foregrounding happens many times a day and the token almost never
      // changes between two of them, so a resume only re-registers if it has
      // been a while. Six hours still keeps expo_push_tokens.updated_at fresh
      // enough to be the "is this device still registering?" signal the push
      // diagnostics read it as.
      if (!force && Date.now() - lastSyncedAt < 6 * 60 * 60 * 1000) return;
      inFlight = true;
      syncPushToken(userId)
        .then(result => {
          // Only a success starts the clock. A sync that failed because the
          // device was offline at launch must be retried on the next resume,
          // not suppressed for six hours — that would recreate the silent
          // stale-token state this hook exists to prevent.
          if (result === 'synced' || result === 'unsupported') lastSyncedAt = Date.now();
          if (!cancelled && result === 'permission_revoked') onProfileChangedRef.current?.();
        })
        .catch(e => console.error('[push] token sync:', e))
        .finally(() => { inFlight = false; });
    };

    sync(true);

    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') sync(false);
    });
    const tokenListener = Notifications.addPushTokenListener(() => sync(true));

    return () => {
      cancelled = true;
      appState.remove();
      tokenListener.remove();
    };
  }, [userId, pushEnabled]);
}
