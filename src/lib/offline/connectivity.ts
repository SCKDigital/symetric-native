import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

import { IS_DEMO } from '@/lib/supabase';

// Whether the phone can currently reach the internet, as NetInfo reports it.
//
// This is a hint, not a promise. "Connected" can still mean a captive portal
// or one bar of signal that drops every request, so nothing here is allowed to
// decide that a write succeeded — only the server's answer does that (see
// outbox.ts). What it does decide is whether to *try*: when the phone says it
// is offline, the outbox doesn't bother sending, and Today shows the offline
// line instead of an error.
//
// isInternetReachable is null until NetInfo's first reachability probe comes
// back. Null counts as online: the opposite default would flash "Offline" at
// every launch.

let online = true;
const listeners = new Set<() => void>();

function readOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

if (!IS_DEMO) {
  // The website demo has no network to lose: its data lives in memory.
  NetInfo.addEventListener(state => {
    const next = readOnline(state);
    if (next === online) return;
    online = next;
    listeners.forEach(l => l());
  });
}

export function isOnline(): boolean {
  return online;
}

/** Calls `listener` whenever the online state flips. Returns the unsubscribe. */
export function subscribeOnline(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, isOnline);
}
