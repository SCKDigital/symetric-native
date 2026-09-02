import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { AUTO_RELOCK_MS } from '@/lib/app-lock';

// Ported from the web app's src/hooks/useAppLock.ts. Mechanic swap: no
// sessionStorage equivalent on native — web deliberately used
// sessionStorage (not localStorage) so the unlock survives backgrounding
// but not closing the tab. On native, an in-memory ref called from this
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
  const [locked, setLocked] = useState(enabled);
  const hiddenAtRef = useRef<number | null>(null);
  const unlockedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const shouldBeLocked = enabled && !!userId && unlockedUserIdRef.current !== userId;
    setLocked(shouldBeLocked);
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (hiddenAtRef.current === null) return;
      const elapsed = Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (elapsed > AUTO_RELOCK_MS) {
        unlockedUserIdRef.current = null;
        setLocked(true);
      }
    });

    return () => subscription.remove();
  }, [enabled, userId]);

  const unlock = useCallback(() => {
    if (!userId) return;
    unlockedUserIdRef.current = userId;
    setLocked(false);
  }, [userId]);

  return { locked, unlock };
}
