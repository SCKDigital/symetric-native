import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
import { RESCUE_WINDOW_MS } from '@/lib/constants';
import { ensureTodayCheckIns } from '@/lib/scheduler';
import { Baseline, CheckIn, CheckInSettings, DomainType, supabase } from '@/lib/supabase';
import type { TimeFormat } from '@/lib/time-format';

interface State {
  loading: boolean;
  activeDomains: DomainType[];
  baselines: Record<DomainType, number>;
  completedCount: number;
  totalCount: number;
  /** Due now and still inside its expiry window. */
  activeCheckIn: CheckIn | null;
  /** Past its expiry window but still completable — see the rescue rules below. */
  rescuableCheckIn: CheckIn | null;
  /** Nothing left pending, and at least one was answered. */
  allDone: boolean;
  nextScheduled: CheckIn | null;
  /** The one after nextScheduled — Today shows it as "then HH:MM". */
  afterNextScheduled: CheckIn | null;
  /** Most recently completed check-in today, for the edit-window affordance. */
  lastCompleted: CheckIn | null;
  /** Every check-in scheduled for today, in time order. */
  allCheckIns: CheckIn[];
  /** From check_in_settings, not the profile — every clock time on Today is
   *  rendered through lib/time-format.ts with this. */
  timeFormat: TimeFormat;
  /** The whole row: rescheduling validates against window_start/window_end. */
  checkInSettings: CheckInSettings | null;
}

const EMPTY: State = {
  loading: true,
  activeDomains: [],
  baselines: {} as Record<DomainType, number>,
  completedCount: 0,
  totalCount: 0,
  activeCheckIn: null,
  rescuableCheckIn: null,
  allDone: false,
  nextScheduled: null,
  afterNextScheduled: null,
  lastCompleted: null,
  allCheckIns: [],
  timeFormat: '12hr',
  checkInSettings: null,
};

/**
 * Scoped port of the data-fetching slice of the web app's TodayScreen.tsx —
 * NOT the full screen. Now also returns what the homescreen needs to render
 * the next-check-in block and the ten-minute edit affordance: the check-in
 * after next, the most recent completed one, and the full day's list.
 *
 * Still not ported: the 5-minute snooze, day summaries, and milestones.
 */
export function useTodayCheckIns() {
  const { user, profile } = useAuth();
  const [state, setState] = useState<State>(EMPTY);

  const load = useCallback(async () => {
    if (!user) return;
    setState(prev => ({ ...prev, loading: true }));

    const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    await ensureTodayCheckIns(user.id, timezone);

    const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const [checkInsRes, settingsRes, baselinesRes] = await Promise.all([
      supabase.from('check_ins').select('*').eq('user_id', user.id).eq('scheduled_date', todayLocal).order('scheduled_at', { ascending: true }),
      supabase.from('check_in_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('baselines').select('*').eq('user_id', user.id).eq('is_current', true).order('set_at', { ascending: false }),
    ]);

    const activeDomains = resolveActiveDomains(settingsRes.data);

    const baselines = {} as Record<DomainType, number>;
    (baselinesRes.data as Baseline[] | null)?.forEach(b => {
      if (baselines[b.domain] === undefined) baselines[b.domain] = b.baseline_score;
    });

    const fetched = (checkInsRes.data as CheckIn[] | null) ?? [];
    // The clock is read here (data-fetch time), not during render, so these
    // stay off-limits to the "impure during render" lint rule — a snapshot per
    // load() call rather than a live-ticking clock.
    const now = Date.now();

    // ── Expiry and rescue, ported from the web app's TodayScreen.tsx ────────
    //
    // Nothing expired check-ins natively before this: a row stayed `pending`
    // in the database indefinitely, so a check-in missed at 09:00 was still
    // being presented as due at midnight, and every later one queued behind
    // it. Rows are marked expired here rather than by a job, exactly as on the
    // web, so the two apps agree about what a missed check-in is.
    //
    // One past-expiry check-in can still be rescued, but only when nothing
    // else is currently due and the next scheduled one is at least 90 minutes
    // off. Answering a stale check-in right before the next one would put two
    // near-simultaneous samples in the day, which the detectors would read as
    // two independent readings of the same moment.
    const nowPlus2Min = now + 2 * 60_000;
    const isActive = (c: CheckIn) =>
      c.status === 'pending'
      && new Date(c.scheduled_at).getTime() <= nowPlus2Min
      && new Date(c.expires_at).getTime() >= now;

    const pastExpiry = fetched.filter(c => c.status === 'pending' && new Date(c.expires_at).getTime() < now);
    const fullyExpiredIds = new Set<string>();
    let rescuable: CheckIn | null = null;

    if (pastExpiry.length > 0) {
      const nextPendingMs = fetched
        .filter(c => c.status === 'pending' && new Date(c.scheduled_at).getTime() > now)
        .map(c => new Date(c.scheduled_at).getTime())
        .sort((a, b) => a - b)[0];
      const gapToNext = nextPendingMs !== undefined ? nextPendingMs - now : Infinity;

      if (!fetched.some(isActive) && gapToNext >= RESCUE_WINDOW_MS) {
        // Only the most recent of them; anything older expires normally.
        const sorted = [...pastExpiry].sort(
          (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
        rescuable = sorted[0];
        sorted.slice(1).forEach(c => fullyExpiredIds.add(c.id));
      } else {
        pastExpiry.forEach(c => fullyExpiredIds.add(c.id));
      }
    }

    if (fullyExpiredIds.size > 0) {
      await Promise.all([...fullyExpiredIds].map(id =>
        supabase.from('check_ins').update({ status: 'expired' }).eq('id', id)));
    }

    const todaysCheckIns = fetched.map(c =>
      (fullyExpiredIds.has(c.id) ? { ...c, status: 'expired' as const } : c));

    const activeCheckIn = todaysCheckIns.find(isActive) ?? null;
    const upcoming = todaysCheckIns.filter(c => c.status === 'pending' && new Date(c.scheduled_at).getTime() > now);
    const nextScheduled = upcoming[0] ?? null;
    const afterNextScheduled = upcoming[1] ?? null;
    // Latest completion, not the last row in schedule order — a bonus check-in
    // is inserted with scheduled_at = now, so schedule order and completion
    // order can disagree, and the edit window belongs to whatever was actually
    // filled in most recently.
    const lastCompleted = todaysCheckIns
      .filter(c => c.status === 'completed' && c.completed_at)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0] ?? null;

    const completedCount = todaysCheckIns.filter(c => c.status === 'completed').length;
    const totalCount = todaysCheckIns.length;

    setState({
      loading: false,
      activeDomains,
      baselines,
      completedCount,
      totalCount,
      activeCheckIn,
      rescuableCheckIn: activeCheckIn ? null : rescuable,
      // Not `completed === total`: once anything expires that can never be
      // true, and the day would read as still in progress at midnight.
      allDone: totalCount > 0 && completedCount > 0 && todaysCheckIns.every(c => c.status !== 'pending'),
      nextScheduled,
      afterNextScheduled,
      lastCompleted,
      allCheckIns: todaysCheckIns,
      timeFormat: (settingsRes.data?.time_format as TimeFormat | undefined) ?? '12hr',
      checkInSettings: (settingsRes.data as CheckInSettings | null) ?? null,
    });
  }, [user, profile?.timezone]);

  useEffect(() => {
    // load() is an async function that only calls setState after its
    // internal awaits resolve — genuinely deferred, not synchronous-in-effect
    // — but the linter traces into local function references and can't
    // prove that itself, unlike an opaque `.then()` callback elsewhere in
    // this codebase (see auth-context.tsx). This is the standard "fetch
    // data on mount" effect, not the redundant-state pattern the rule
    // targets — see https://react.dev/learn/you-might-not-need-an-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, refresh: load };
}
