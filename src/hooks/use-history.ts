import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { ensureUTC } from '@/lib/date-utils';
import { fetchMarkersInRange } from '@/lib/queries/markers';
import { CheckIn, SleepLog, supabase } from '@/lib/supabase';
import type { BodyCheckIn, BodyEvent, BodyEventSite, BodyPainSite } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

export interface DayData {
  date: string;
  checkIns: CheckIn[];
  sleepLog: SleepLog | null;
  markers: InterventionMarker[];
  bodyEntry?: BodyCheckIn;
  bodyPainSites: BodyPainSite[];
  bodyEvents: (BodyEvent & { body_event_sites: BodyEventSite[] })[];
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
 * there's nothing beyond that). Intervention markers and body check-ins/
 * events (chunk 2 of the body-tracking port) are now included; still
 * deliberately not ported: clusters/pattern highlighting, the Calendar
 * view.
 */
export function useHistory() {
  const { user, profile } = useAuth();
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

    const bodyTrackingEnabled = profile?.body_tracking_enabled ?? false;

    const [{ data: checkIns }, { data: sleepLogs }, markers, { data: bodyCheckIns }, { data: bodyEventsData }] = await Promise.all([
      supabase.from('check_ins').select('*').eq('user_id', user.id).gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: false }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', fromStr).order('log_date', { ascending: false }),
      fetchMarkersInRange(fromStr, todayStr).catch(() => [] as InterventionMarker[]),
      bodyTrackingEnabled
        ? supabase.from('body_checkins').select('*').eq('user_id', user.id).gte('entry_date', fromStr)
        : Promise.resolve({ data: [] as BodyCheckIn[] }),
      bodyTrackingEnabled
        ? supabase.from('body_events').select('*, body_event_sites(*)').eq('user_id', user.id).gte('event_date', fromStr)
        : Promise.resolve({ data: [] as (BodyEvent & { body_event_sites: BodyEventSite[] })[] }),
    ]);

    const bodyEvents = (bodyEventsData ?? []) as (BodyEvent & { body_event_sites: BodyEventSite[] })[];

    let bodyPainSites: BodyPainSite[] = [];
    if (bodyCheckIns?.length) {
      const { data: sites } = await supabase.from('body_pain_sites').select('*').in('body_checkin_id', bodyCheckIns.map(c => c.id));
      bodyPainSites = sites ?? [];
    }

    const bodyCheckInsByDate = new Map<string, BodyCheckIn>();
    (bodyCheckIns ?? []).forEach(c => bodyCheckInsByDate.set(c.entry_date, c));
    const bodyPainSitesByCheckinId = new Map<string, BodyPainSite[]>();
    bodyPainSites.forEach(s => {
      if (!bodyPainSitesByCheckinId.has(s.body_checkin_id)) bodyPainSitesByCheckinId.set(s.body_checkin_id, []);
      bodyPainSitesByCheckinId.get(s.body_checkin_id)!.push(s);
    });
    const bodyEventsByDate = new Map<string, (BodyEvent & { body_event_sites: BodyEventSite[] })[]>();
    bodyEvents.forEach(e => {
      if (!bodyEventsByDate.has(e.event_date)) bodyEventsByDate.set(e.event_date, []);
      bodyEventsByDate.get(e.event_date)!.push(e);
    });

    const markersByDate = new Map<string, InterventionMarker[]>();
    markers.forEach(m => {
      if (!markersByDate.has(m.marker_date)) markersByDate.set(m.marker_date, []);
      markersByDate.get(m.marker_date)!.push(m);
    });

    function bodyFor(date: string): { bodyEntry?: BodyCheckIn; bodyPainSites: BodyPainSite[]; bodyEvents: (BodyEvent & { body_event_sites: BodyEventSite[] })[] } {
      const bodyEntry = bodyCheckInsByDate.get(date);
      return {
        bodyEntry,
        bodyPainSites: bodyEntry ? (bodyPainSitesByCheckinId.get(bodyEntry.id) ?? []) : [],
        bodyEvents: bodyEventsByDate.get(date) ?? [],
      };
    }

    const dayMap = new Map<string, DayData>();
    const emptyDay = (date: string): DayData => ({ date, checkIns: [], sleepLog: null, markers: markersByDate.get(date) ?? [], ...bodyFor(date) });

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
    // A marker-only or body-only day (e.g. logged a medication change or a
    // body check-in but no mind check-in/sleep log that day) wouldn't
    // otherwise produce a row at all.
    const extraDates = new Set<string>([...markersByDate.keys(), ...bodyCheckInsByDate.keys(), ...bodyEventsByDate.keys()]);
    extraDates.forEach(date => {
      if (!dayMap.has(date)) dayMap.set(date, emptyDay(date));
    });

    const sorted = Array.from(dayMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const thirtyDaysAgoStr = thirtyDaysAgo.toLocaleDateString('en-CA');
    const hasDataBeyond30Days = sorted.some(d => d.date < thirtyDaysAgoStr);

    setState({ loading: false, days: hasDataBeyond30Days ? sorted : sorted.filter(d => d.date >= thirtyDaysAgoStr) });
  }, [user, profile?.body_tracking_enabled]);

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
