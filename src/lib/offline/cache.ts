import AsyncStorage from '@react-native-async-storage/async-storage';

// The last good copy of a read, kept on the phone so a screen has something to
// show when the server can't be reached.
//
// Only ever a fallback. Every screen still reads the server first; this is
// what it falls back to when that read fails, so a stale cache can never hide
// newer data from someone who is online.
//
// Keyed by user, so signing in as someone else can never surface the previous
// account's data. Wrapped in try/catch throughout: a full or corrupt store
// must cost the offline copy, never the screen.

const PREFIX = 'symetric.cache.v1';

function key(userId: string, name: string): string {
  return `${PREFIX}.${userId}.${name}`;
}

export async function readCache<T>(userId: string, name: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.warn('[cache] read failed:', name, e);
    return null;
  }
}

export async function writeCache(userId: string, name: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId, name), JSON.stringify(value));
  } catch (e) {
    console.warn('[cache] write failed:', name, e);
  }
}

/** Removes every cached read for one account. Used when the account is deleted. */
export async function clearCache(userId: string): Promise<void> {
  try {
    const prefix = `${PREFIX}.${userId}.`;
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.warn('[cache] clear failed:', e);
  }
}

/** True when a Supabase/PostgREST error means "couldn't reach the server"
 *  rather than "the server said no". supabase-js returns network failures as
 *  an error object with status 0 instead of throwing. */
export function isNetworkError(error: unknown, status?: number): boolean {
  if (!error) return false;
  if (status === 0) return true;
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : String(error);
  return /network request failed|failed to fetch|fetch failed|network error|timed? ?out|aborted/i.test(message);
}
