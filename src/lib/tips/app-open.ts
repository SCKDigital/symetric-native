import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * What counts as "opening the app", for the one-tip-per-open rule.
 *
 * A cold start is an open. So is coming back from the background after 30
 * minutes or more away. Anything shorter — flicking to Messages and back, the
 * permission prompt, a share sheet — is the same visit, and must not cycle the
 * tip, or someone checking a text mid-check-in would see a new card each time.
 *
 * Only a real 'background' starts the clock. iOS also reports 'inactive' for
 * system dialogs and Control Centre, which are not leaving the app.
 *
 * Each open gets an id (its start time). Tips compare ids to tell "the same
 * open, re-rendered" from "a new open", so nothing here is per user.
 */
export const RETURN_AFTER_MS = 30 * 60 * 1000;

let openId = Date.now();
let backgroundedAt: number | null = null;
const listeners = new Set<() => void>();

AppState.addEventListener('change', state => {
  if (state === 'background') {
    backgroundedAt = Date.now();
    return;
  }
  if (state === 'active' && backgroundedAt !== null) {
    const away = Date.now() - backgroundedAt;
    backgroundedAt = null;
    if (away >= RETURN_AFTER_MS) {
      openId = Date.now();
      for (const l of listeners) l();
    }
  }
});

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The current open's id. Changes once per new open, never mid-visit. */
export function useAppOpenId(): number {
  return useSyncExternalStore(subscribe, () => openId, () => openId);
}
