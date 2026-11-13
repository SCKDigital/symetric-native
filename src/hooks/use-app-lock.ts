import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { AUTO_RELOCK_MS } from '@/lib/app-lock';

const APP_LOCK_CAPTURE_KEY = 'app-lock';

// Ported from the web app's src/hooks/useAppLock.ts. Mechanic swap: no
// sessionStorage equivalent on native — web deliberately used
// sessionStorage (not localStorage) so the unlock survives backgrounding
// but not closing the tab. On native, in-memory state held by this
// hook's owner (the root layout's AuthGate, which stays mounted for the
// whole app lifetime) already has exactly that lifetime: it survives
// backgrounding and screen navigation, and resets on its own the moment the
// JS context is torn down by an app kill/relaunch — no storage API needed
// at all. Tracks *which* userId last unlocked (not just a boolean) so a
// sign-out/sign-in as a different user doesn't inherit a stale unlock,
// matching the web version's per-user sessionStorage key.
//
// document.visibilitychange -> AppState's 'change' event; any non-'active'
// state (both iOS's transient 'inactive' and 'background') counts as
// hidden, closest match to the web version's document.hidden boolean.
export function useAppLock(userId: string | undefined, enabled: boolean) {
  const hiddenAtRef = useRef<number | null>(null);
  // State rather than a ref, so `locked` can be derived during render. It
  // used to be set from an effect, which runs after the commit: the render
  // in which the profile arrived drew the tab shell (and started its
  // fetches) for a frame before the lock screen replaced it.
  const [unlockedUserId, setUnlockedUserId] = useState<string | null>(null);
  const locked = enabled && !!userId && unlockedUserId !== userId;
  // Away from the foreground. With the lock on, the app's contents are
  // covered while it is, so iOS's app-switcher snapshot doesn't show the
  // health data the PIN is there to keep private.
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;

    const subscription = AppState.addEventListener('change', nextState => {
      setAway(nextState !== 'active');
      if (nextState !== 'active') {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (hiddenAtRef.current === null) return;
      const elapsed = Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (elapsed > AUTO_RELOCK_MS) setUnlockedUserId(null);
    });

    return () => subscription.remove();
  }, [enabled, userId]);

  // The covering view above is drawn by JS after the app has already been
  // told it is going away, which is too late for the OS's app-switcher
  // snapshot on Android (it has no 'inactive' step to buy time) and only
  // usually in time on iOS. These are the native protections: FLAG_SECURE on
  // Android, which blanks the recents preview (and, as a side effect, blocks
  // screenshots while the lock is on), and a native blur over iOS's snapshot.
  useEffect(() => {
    const on = enabled && !!userId;
    if (!on || Platform.OS === 'web') return;
    const apply = Platform.OS === 'android'
      ? ScreenCapture.preventScreenCaptureAsync(APP_LOCK_CAPTURE_KEY)
      : ScreenCapture.enableAppSwitcherProtectionAsync(0.8);
    apply.catch(e => console.warn('[app-lock] snapshot protection:', e));
    return () => {
      const release = Platform.OS === 'android'
        ? ScreenCapture.allowScreenCaptureAsync(APP_LOCK_CAPTURE_KEY)
        : ScreenCapture.disableAppSwitcherProtectionAsync();
      release.catch(e => console.warn('[app-lock] snapshot protection release:', e));
    };
  }, [enabled, userId]);

  const unlock = useCallback(() => {
    if (userId) setUnlockedUserId(userId);
  }, [userId]);

  return { locked, unlock, obscured: enabled && !!userId && away };
}
