import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { HANDLERS, type CommandPayloads, type CommandType, isTransient } from '@/lib/offline/commands';
import { isOnline } from '@/lib/offline/connectivity';
import { supabase } from '@/lib/supabase';

// ─── The outbox ─────────────────────────────────────────────────────────────
//
// Every entry a person makes — a check-in, a body check-in, a sleep score, a
// marker — goes through here instead of straight to Supabase. Saving puts a
// command in this queue (persisted to the phone before anything else happens)
// and then tries to send it. Three things can come back:
//
//   synced    the server accepted it. The common case; to the user, nothing
//             is different from before this existed.
//   queued    the server couldn't be reached. The command stays here and is
//             sent later, by the runner in use-outbox-runner.ts, when the
//             connection returns or the app comes back to the foreground.
//   rejected  the server answered and said no — RLS, a constraint, a bad
//             value. Retrying won't change that answer, so the command is
//             dropped and the caller shows its usual inline error, exactly as
//             it did when it wrote to Supabase directly.
//
// Commands are intents ("complete check-in X with these values"), not raw row
// writes, and every handler in commands.ts converges on a state rather than
// applying a delta. That is what makes replay safe: the app can be killed
// half-way through a send and the next attempt simply runs the command again.
//
// A command that was queued and then rejected on a later, background attempt
// has no form open to show an error in. It is kept, marked failed, and Today
// says "1 entry couldn't sync" with a way to retry or discard it. Nothing a
// person entered is ever dropped without them being told.

export interface Command<T extends CommandType = CommandType> {
  id: string;
  userId: string;
  type: T;
  payload: CommandPayloads[T];
  createdAt: string;
  attempts: number;
  state: 'pending' | 'failed';
  lastError?: string;
}

export type SubmitResult =
  | { status: 'synced' }
  | { status: 'queued' }
  | { status: 'rejected'; error: string };

export interface OutboxSnapshot {
  /** Commands not yet accepted by the server, failed ones included. */
  items: readonly Command[];
  pendingCount: number;
  failedCount: number;
  /** A send is in progress right now. */
  syncing: boolean;
}

const STORAGE_PREFIX = 'symetric.outbox.v1';

let currentUser: string | null = null;
let queue: Command[] = [];
let loadPromise: Promise<void> | null = null;
let syncing = false;
let flushChain: Promise<void> = Promise.resolve();

const listeners = new Set<() => void>();
const syncedListeners = new Set<(types: CommandType[]) => void>();
let snapshot: OutboxSnapshot = { items: [], pendingCount: 0, failedCount: 0, syncing: false };

function emit() {
  snapshot = {
    items: queue,
    pendingCount: queue.filter(c => c.state === 'pending').length,
    failedCount: queue.filter(c => c.state === 'failed').length,
    syncing,
  };
  listeners.forEach(l => l());
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

/** Loads this user's queue from the phone. Switching user swaps the queue
 *  out; the previous account's commands stay stored under its own key and are
 *  sent the next time that account signs in here. */
export function loadOutbox(userId: string): Promise<void> {
  if (currentUser === userId && loadPromise) return loadPromise;
  currentUser = userId;
  queue = [];
  emit();
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      if (currentUser !== userId) return;
      queue = raw ? (JSON.parse(raw) as Command[]) : [];
    } catch (e) {
      console.error('[outbox] load failed:', e);
      queue = [];
    }
    emit();
  })();
  return loadPromise;
}

async function persist() {
  if (!currentUser) return;
  // Thrown, not swallowed. A command that can't be written to the phone is a
  // command that would be lost if the app closed before it was sent, so
  // submit() must not report it as safely queued.
  await AsyncStorage.setItem(storageKey(currentUser), JSON.stringify(queue));
}

/**
 * Saves a command and tries to send it. Resolves once the outcome is known:
 * synced, queued for later, or rejected by the server. Never resolves
 * `queued` unless the command is on disk.
 */
export async function submit<T extends CommandType>(
  userId: string,
  type: T,
  payload: CommandPayloads[T],
): Promise<SubmitResult> {
  await loadOutbox(userId);
  const command: Command<T> = {
    id: Crypto.randomUUID(),
    userId,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: 'pending',
  };
  queue = [...queue, command as Command];
  try {
    await persist();
  } catch (e) {
    queue = queue.filter(c => c.id !== command.id);
    emit();
    console.error('[outbox] could not store command:', e);
    return { status: 'rejected', error: 'Could not save on this phone.' };
  }
  emit();

  await flush();

  const after = queue.find(c => c.id === command.id);
  if (!after) return { status: 'synced' };
  if (after.state === 'failed') {
    // Rejected on its first attempt, with the form still open: hand the error
    // back and drop the command, so the person can correct and resave rather
    // than leaving a dead entry in the queue.
    queue = queue.filter(c => c.id !== command.id);
    await persist().catch(e => console.error('[outbox] persist failed:', e));
    emit();
    return { status: 'rejected', error: after.lastError ?? 'The server rejected this entry.' };
  }
  return { status: 'queued' };
}

/**
 * Sends every pending command, oldest first. Calls are serialised: a flush
 * requested while one is running waits for it and then runs again, so order
 * is kept and nothing is sent twice at once.
 *
 * Stops at the first transient failure. If one request couldn't reach the
 * server the next one almost certainly can't either, and stopping keeps the
 * commands in the order they were made.
 */
export function flush(): Promise<void> {
  flushChain = flushChain.then(safeFlush);
  return flushChain;
}

async function safeFlush() {
  try {
    await runFlush();
  } catch (e) {
    // getSession, storage, anything unexpected. The commands are still on
    // disk; the next trigger tries again.
    console.error('[outbox] flush failed:', e);
    syncing = false;
    emit();
  }
}

async function runFlush() {
  const userId = currentUser;
  if (!userId) return;
  await loadPromise;
  if (!queue.some(c => c.state === 'pending')) return;
  if (!isOnline()) return;

  // No session, or one that can't be refreshed right now, means every request
  // would come back 401. Wait for the next attempt instead.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.id !== userId) return;

  syncing = true;
  emit();
  const synced: CommandType[] = [];
  try {
    for (const command of [...queue]) {
      if (currentUser !== userId) return;
      if (command.state !== 'pending') continue;
      try {
        const handler = HANDLERS[command.type] as (p: unknown, uid: string) => Promise<void>;
        await handler(command.payload, userId);
        queue = queue.filter(c => c.id !== command.id);
        synced.push(command.type);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (isTransient(e)) {
          queue = queue.map(c => (c.id === command.id ? { ...c, attempts: c.attempts + 1, lastError: message } : c));
          console.warn('[outbox] send deferred:', command.type, message);
          await persist().catch(err => console.error('[outbox] persist failed:', err));
          emit();
          break;
        }
        console.error('[outbox] rejected by server:', command.type, message);
        queue = queue.map(c => (c.id === command.id
          ? { ...c, attempts: c.attempts + 1, state: 'failed' as const, lastError: message }
          : c));
      }
      await persist().catch(e => console.error('[outbox] persist failed:', e));
      emit();
    }
  } finally {
    syncing = false;
    emit();
  }
  if (synced.length > 0) syncedListeners.forEach(l => l(synced));
}

/** Puts a failed command back in line and tries again. */
export async function retryFailed(): Promise<void> {
  queue = queue.map(c => (c.state === 'failed' ? { ...c, state: 'pending' as const } : c));
  await persist().catch(e => console.error('[outbox] persist failed:', e));
  emit();
  await flush();
}

/** Drops every failed command. Only ever called after the person confirms. */
export async function discardFailed(): Promise<void> {
  queue = queue.filter(c => c.state !== 'failed');
  await persist().catch(e => console.error('[outbox] persist failed:', e));
  emit();
}

/**
 * Sends everything waiting and says whether it all went. For actions that
 * act on the server's copy of the data and would be wrong without every
 * entry in it: an export or report would leave the unsent ones out, and a
 * delete would be undone when they arrived afterwards.
 */
export async function syncBeforeServerAction(): Promise<boolean> {
  await flush();
  return !queue.some(c => c.state === 'pending');
}

/** Forgets this account's queue. Only after the account itself is deleted,
 *  when there is nothing left on the server for these commands to reach. */
export async function clearOutbox(userId: string): Promise<void> {
  if (currentUser === userId) {
    queue = [];
    emit();
  }
  await AsyncStorage.removeItem(storageKey(userId)).catch(e => console.error('[outbox] clear failed:', e));
}

/** Payloads of unsent commands of one type, oldest first, for screens that
 *  merge not-yet-synced entries into what they read from the server. */
export function pendingPayloads<T extends CommandType>(type: T): CommandPayloads[T][] {
  return queue.filter(c => c.type === type).map(c => c.payload as CommandPayloads[T]);
}

/** Unsent commands of several types, in the order they were made — for
 *  overlays where a create, edit and delete of the same thing must apply in turn. */
export function pendingCommandsOf(types: CommandType[]): Command[] {
  return queue.filter(c => types.includes(c.type));
}

export function getOutboxSnapshot(): OutboxSnapshot {
  return snapshot;
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Called after a flush that sent at least one command, with their types. */
export function onSynced(listener: (types: CommandType[]) => void): () => void {
  syncedListeners.add(listener);
  return () => { syncedListeners.delete(listener); };
}

export function useOutbox(): OutboxSnapshot {
  return useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getOutboxSnapshot);
}
