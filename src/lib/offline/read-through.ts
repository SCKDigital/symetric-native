import { isNetworkError, readCache, writeCache } from '@/lib/offline/cache';
import { isOnline } from '@/lib/offline/connectivity';
import { currentUserId } from '@/lib/offline/session';

/**
 * Runs a read and keeps its result on the phone; if the read fails for want
 * of a connection, returns the last result kept under the same name instead.
 * Any other failure, or a name never read before, still throws, so callers'
 * existing error handling is unchanged.
 *
 * The value is wrapped before caching, so a read whose real answer is null
 * (no upcoming appointment) is told apart from "never cached".
 */
export async function readThrough<T>(name: string, read: () => Promise<T>): Promise<T> {
  const userId = await currentUserId();
  try {
    const value = await read();
    if (userId) writeCache(userId, `read.${name}`, { value });
    return value;
  } catch (e) {
    if (userId && (!isOnline() || isNetworkError(e))) {
      const cached = await readCache<{ value: T }>(userId, `read.${name}`);
      if (cached) return cached.value;
    }
    throw e;
  }
}
