import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { addDays } from '@/lib/date-utils';
import { localTimeToUTC } from '@/lib/scheduler';
import { supabase } from '@/lib/supabase';

/** How long an armed comfort window lasts. Two options on purpose — a duration
 *  picker is itself a demand, which is the thing this mode exists to remove. */
export type ComfortDuration = '2h' | 'today';

/** A window arming with less than this left runs for this long instead, so
 *  "rest of today" tapped at 23:58 isn't two minutes of comfort mode. */
const MIN_WINDOW_MS = 30 * 60 * 1000;

/** The state is a timestamp, so it expires on its own — but only if something
 *  re-reads the clock while the app is open. Thirty seconds matches the tick
 *  Today already runs for the check-in countdown. */
const TICK_MS = 30_000;

// One timer for every useComfort() in the tree. The hook is read by each card
// that dims, scales or hides a countdown, so per-instance intervals would mean
// half a dozen of them ticking in lockstep to observe the same clock.
const tickSubscribers = new Set<(ms: number) => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToTick(fn: (ms: number) => void): () => void {
  tickSubscribers.add(fn);
  if (tickTimer === null) {
    tickTimer = setInterval(() => {
      const ms = Date.now();
      for (const sub of tickSubscribers) sub(ms);
    }, TICK_MS);
  }
  return () => {
    tickSubscribers.delete(fn);
    if (tickSubscribers.size === 0 && tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

export interface Comfort {
  /** Quiet colours, larger check-in type, no expiry countdown. True for either
   *  the standing preference or an armed window. */
  active: boolean;
  /** The standing preference (profiles.comfort_mode) — on until turned off. */
  standing: boolean;
  /**
   * The layers that reduce what the app asks for: reminder push is muted and
   * the one-tap check-in is offered. Armed windows ONLY, never the standing
   * preference.
   *
   * That split is deliberate and load-bearing. checkSustainedDeviationQuality
   * rejects any window below 40% coverage or 1.5 check-ins/day, so a user who
   * left comfort mode on permanently and stopped being reminded would slide
   * under the floor and detection would simply stop finding things — silently.
   * Bounding the mute to a timestamp means coverage always recovers by itself.
   */
  reducesDemand: boolean;
  /** When the armed window ends, or null if only the standing preference is on. */
  endsAt: Date | null;
  arm: (duration: ComfortDuration) => Promise<void>;
  disarm: () => Promise<void>;
  setStanding: (on: boolean) => Promise<void>;
  /** Set when the last write failed; the optimistic value has been rolled back. */
  error: string | null;
}

/** Local 'YYYY-MM-DD' in the given zone. Same idiom as scheduler.ts's
 *  ensureTodayCheckIns — en-CA formats as YYYY-MM-DD. */
function localDateInTZ(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/**
 * Resolves `duration` to the instant the window should end.
 *
 * "Rest of today" is midnight in the user's PROFILE timezone, not the device's,
 * and it is built by handing a date string and a time string to localTimeToUTC
 * — never by formatting a Date to a locale string and parsing it back. That
 * round-trip is what 266465b removed from the scheduler: it works in a dev
 * browser and returns Invalid Date on Hermes, silently.
 */
function windowEnd(duration: ComfortDuration, timezone: string, now: Date): Date {
  if (duration === '2h') return new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const tomorrow = addDays(localDateInTZ(now, timezone), 1);
  const midnight = localTimeToUTC(tomorrow, '00:00', timezone);
  return midnight.getTime() - now.getTime() < MIN_WINDOW_MS
    ? new Date(now.getTime() + MIN_WINDOW_MS)
    : midnight;
}

/**
 * Comfort mode, read as one boolean by everything that cares.
 *
 * Two ways to be in it (see 20260918000001_comfort_mode_state.sql): the
 * standing `comfort_mode` preference, or an armed `comfort_until` window that
 * expires by itself.
 */
export function useComfort(): Comfort {
  const { user, profile, refreshProfile } = useAuth();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  // Held only until refreshProfile brings the written value back, so the
  // Settings switch and the sheet respond on tap rather than after a round trip.
  const [override, setOverride] = useState<{ comfort_mode?: boolean; comfort_until?: string | null } | null>(null);
  // Stamped per write so a slow round trip can't clear an override that a
  // later tap has already replaced. Only ever touched inside write(), never
  // during render.
  const writeSeqRef = useRef(0);

  useEffect(() => subscribeToTick(setNowMs), []);

  const standing = override?.comfort_mode ?? profile?.comfort_mode ?? false;
  const untilRaw = override && 'comfort_until' in override ? override.comfort_until : profile?.comfort_until;

  const endsAt = useMemo(() => {
    if (!untilRaw) return null;
    const at = new Date(untilRaw);
    return Number.isNaN(at.getTime()) || at.getTime() <= nowMs ? null : at;
  }, [untilRaw, nowMs]);

  const write = useCallback(
    async (patch: { comfort_mode?: boolean; comfort_until?: string | null }) => {
      if (!user) return;
      const seq = ++writeSeqRef.current;
      setError(null);
      setOverride(patch);
      const { error: writeError } = await supabase.from('profiles').update(patch).eq('id', user.id);
      const isLatest = () => seq === writeSeqRef.current;
      if (writeError) {
        if (isLatest()) {
          setOverride(null);
          setError('Could not save that. Please try again.');
        }
        return;
      }
      await refreshProfile();
      // Only clear if nothing newer has been written in the meantime.
      if (isLatest()) setOverride(null);
    },
    [user, refreshProfile],
  );

  const arm = useCallback(
    async (duration: ComfortDuration) => {
      const end = windowEnd(duration, profile?.timezone ?? 'UTC', new Date());
      setNowMs(Date.now());
      await write({ comfort_until: end.toISOString() });
    },
    [profile?.timezone, write],
  );

  const disarm = useCallback(() => write({ comfort_until: null }), [write]);
  const setStanding = useCallback((on: boolean) => write({ comfort_mode: on }), [write]);

  return {
    active: standing || endsAt !== null,
    standing,
    reducesDemand: endsAt !== null,
    endsAt,
    arm,
    disarm,
    setStanding,
    error,
  };
}
