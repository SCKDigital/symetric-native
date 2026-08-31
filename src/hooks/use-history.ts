import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { ensureUTC } from '@/lib/date-utils';
import { fetchMarkersInRange } from '@/lib/queries/markers';
import { CheckIn, SleepLog, supabase } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

export interface DayData {
  date: string;
  checkIns: CheckIn[];
  sleepLog: SleepLog | null;
  markers: InterventionMarker[];
}

interface State {
  loading: boolean;
  days: DayData[];
}

/**
 * Scoped port of the data-fetching half of the web app's HistoryScreen.tsx
 * (556 lines, plus DayCard/MonthViewCalendar/body — 1,630 lines across the
 * whole History component family). Same day-bucketing logic (check_ins +
 * sleep_logs merged by local date, 90-day window, trimmed to 30 days unless
 * there's nothing beyond that). Intervention markers are now included
 * (ported alongside Settings' marker CRUD); still deliberately not ported:
 * clusters/pattern highlighting, body tracking days, the Calendar view.
 */
export function useHistory() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ loading: true, days: [] });

  const load = useCallback(async () => {
    if (!user) return;
    setState(prev => ({ ...prev, loading: true }));

    const todayStr = new Date().toLocaleDateString('en-CA');
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromStr = ninetyDaysAgo.toLocaleDateString('en-CA');

    const [{ data: checkIns }, { data: sleepLogs }, markers] = await Promise.all([
      supabase.from('check_ins').select('*').eq('user_id', user.id).gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: false }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', fromStr).order('log_date', { ascending: false }),
      fetchMarkersInRange(fromStr, todayStr).catch(() => [] as InterventionMarker[]),
    ]);

    const markersByDate = new Map<string, InterventionMarker[]>();
    markers.forEach(m => {
      if (!markersByDate.has(m.marker_date)) markersByDate.set(m.marker_date, []);
      markersByDate.get(m.marker_date)!.push(m);
    });

    const dayMap = new Map<string, DayData>();
    const emptyDay = (date: string): DayData => ({ date, checkIns: [], sleepLog: null, markers: markersByDate.get(date) ?? [] });

    dayMap.set(todayStr, emptyDay(todayStr));

    checkIns?.forEach(ci => {
      const date = ensureUTC(ci.scheduled_at).toLocaleDateString('en-CA');
      if (!dayMap.has(date)) dayMap.set(date, emptyDay(date));
      dayMap.get(date)!.checkIns.push(ci);
    });
    sleepLogs?.forEach((log: SleepLog) => {
      if (!dayMap.has(log.log_date)) dayMap.set(log.log_date, emptyDay(log.log_date));
      else dayMap.get(log.log_date)!.sleepLog = log;
    });
    // A marker-only day (e.g. logged a medication change but no check-in or
    // sleep that day) wouldn't otherwise produce a row at all.
    markersByDate.forEach((_, date) => {
      if (!dayMap.has(date)) dayMap.set(date, emptyDay(date));
    });

    const sorted = Array.from(dayMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const thirtyDaysAgoStr = thirtyDaysAgo.toLocaleDateString('en-CA');
    const hasDataBeyond30Days = sorted.some(d => d.date < thirtyDaysAgoStr);

    setState({ loading: false, days: hasDataBeyond30Days ? sorted : sorted.filter(d => d.date >= thirtyDaysAgoStr) });
  }, [user]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment —
    // same shape: a locally-defined async fetch function called on mount,
    // which the linter traces into and flags even though the setState calls
    // inside load() only run after its internal awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, refresh: load };
}
