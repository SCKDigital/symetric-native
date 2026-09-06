import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
import { ensureTodayCheckIns } from '@/lib/scheduler';
import { Baseline, CheckIn, CheckInSettings, DomainType, supabase } from '@/lib/supabase';
import type { TimeFormat } from '@/lib/time-format';

interface State {
  loading: boolean;
  activeDomains: DomainType[];
  baselines: Record<DomainType, number>;
  completedCount: number;
  totalCount: number;
  pendingCheckIn: CheckIn | null;
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
  pendingCheckIn: null,
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
 * Still not ported: expiring stale pending check-ins, rescue/snooze windows,
 * "late" check-in handling, rescheduling, day summaries, and milestones.
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

    const todaysCheckIns = (checkInsRes.data as CheckIn[] | null) ?? [];
    // now/pendingCheckIn/nextScheduled are computed here (data-fetch time),
    // not derived during render, so they stay off-limits to the "impure
    // during render" lint rule — a snapshot taken per load() call rather
    // than a live-ticking clock, which is fine for this scoped port.
    const now = Date.now();
    const pendingCheckIn = todaysCheckIns.find(c => c.status === 'pending' && new Date(c.scheduled_at).getTime() <= now) ?? null;
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

    setState({
      loading: false,
      activeDomains,
      baselines,
      completedCount: todaysCheckIns.filter(c => c.status === 'completed').length,
      totalCount: todaysCheckIns.length,
      pendingCheckIn,
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
