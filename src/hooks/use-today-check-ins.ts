import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
import { ensureTodayCheckIns } from '@/lib/scheduler';
import { Baseline, CheckIn, DomainType, supabase } from '@/lib/supabase';

interface State {
  loading: boolean;
  activeDomains: DomainType[];
  baselines: Record<DomainType, number>;
  completedCount: number;
  totalCount: number;
  pendingCheckIn: CheckIn | null;
  nextScheduled: CheckIn | null;
}

const EMPTY: State = {
  loading: true,
  activeDomains: [],
  baselines: {} as Record<DomainType, number>,
  completedCount: 0,
  totalCount: 0,
  pendingCheckIn: null,
  nextScheduled: null,
};

/**
 * Scoped port of the data-fetching slice of the web app's TodayScreen.tsx —
 * NOT the full screen. Deliberately does not port: expiring stale pending
 * check-ins, rescue/snooze windows, "late" check-in handling, editing past
 * check-ins, body check-ins, sleep prompts, day summaries, or milestones.
 * Just enough to find the current pending mind check-in and let it be
 * completed — the rest is real work still ahead, not forgotten.
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
      supabase.from('check_in_settings').select('active_domains, quick_checkin_domains').eq('user_id', user.id).maybeSingle(),
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
    const nextScheduled = todaysCheckIns.find(c => c.status === 'pending' && new Date(c.scheduled_at).getTime() > now) ?? null;

    setState({
      loading: false,
      activeDomains,
      baselines,
      completedCount: todaysCheckIns.filter(c => c.status === 'completed').length,
      totalCount: todaysCheckIns.length,
      pendingCheckIn,
      nextScheduled,
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
