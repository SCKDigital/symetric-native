import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * The session supabase-js still holds on disk after failing to refresh it.
 *
 * Offline more than an hour after the last refresh, the access token has
 * expired and the refresh can't reach the server, so getSession() and
 * INITIAL_SESSION both report no session — for someone who is still signed
 * in. supabase-js keeps the stored session when the failure was the network
 * (a revoked refresh token removes it), so a session still on disk means
 * "signed in, can't refresh yet". Auto-refresh renews it once the connection
 * is back and reports TOKEN_REFRESHED.
 *
 * Reads supabase-js's storage key, which is not public API. If a future
 * version renames it this returns null, and the app behaves as it did before
 * offline mode: the sign-in screen until the connection returns.
 */
export async function readStoredSession(): Promise<Session | null> {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (!key) return null;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Session>;
    return stored.user?.id && stored.refresh_token ? (stored as Session) : null;
  } catch (e) {
    console.warn('[session] could not read the stored session:', e);
    return null;
  }
}

/** The signed-in user's id, from the live session or, offline, the stored one. */
export async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? (await readStoredSession())?.user.id ?? null;
}
