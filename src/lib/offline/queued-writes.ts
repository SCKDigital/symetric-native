import * as Crypto from 'expo-crypto';

import { submit } from '@/lib/offline/outbox';

// Drop-in replacements for the single-row settings writes the app makes
// directly — `supabase.from('profiles').update(x).eq('id', userId)` and its
// check_in_settings twin — that go through the outbox instead.
//
// Same result shape as the supabase call ({ error }), so each call site's
// existing error handling still runs, and only on what it used to mean: the
// server said no. Offline the write is queued and the change shows at once
// through the overlays (overlayProfile / overlayCheckInSettings).

type Result = { error: Error | null };

function toResult(status: Awaited<ReturnType<typeof submit>>): Result {
  return status.status === 'rejected' ? { error: new Error(status.error) } : { error: null };
}

export async function saveProfile(userId: string, fields: Record<string, unknown>): Promise<Result> {
  return toResult(await submit(userId, 'profile.update', { fields }));
}

export async function saveCheckInSettings(userId: string, fields: Record<string, unknown>): Promise<Result> {
  return toResult(await submit(userId, 'checkInSettings.upsert', { fields }));
}

/** Makes `score` the current baseline for `domain`. */
export async function setBaseline(
  userId: string, domain: string, score: number, source: string,
): Promise<Result> {
  return toResult(await submit(userId, 'baseline.set', {
    row: {
      id: Crypto.randomUUID(), domain, baseline_score: score, source, is_current: true,
      set_at: new Date().toISOString(),
    },
  }));
}

/** Inserts starting baselines, one per domain. */
export async function seedBaselines(
  userId: string, domains: string[], score: number, source: string,
): Promise<Result> {
  const setAt = new Date().toISOString();
  return toResult(await submit(userId, 'baseline.seed', {
    rows: domains.map(domain => ({
      id: Crypto.randomUUID(), domain, baseline_score: score, source, is_current: true, set_at: setAt,
    })),
  }));
}
