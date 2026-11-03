import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { cycleDayForDate, dateToString, ensureUTC } from '@/lib/date-utils';
import { fetchMarkersInRange } from '@/lib/queries/markers';
import { CheckIn, SleepLog, supabase } from '@/lib/supabase';
import type { BodyCheckIn, BodyEvent, BodyEventSite, BodyPainSite } from '@/lib/supabase';
import type { TimeFormat } from '@/lib/time-format';
import type { InterventionMarker } from '@/types/marker';

export interface DayData {
  date: string;
  checkIns: CheckIn[];
  sleepLog: SleepLog | null;
  markers: InterventionMarker[];
  bodyEntry?: BodyCheckIn;
  bodyPainSites: BodyPainSite[];
  bodyEvents: (BodyEvent & { body_event_sites: BodyEventSite[] })[];
  /** "Day N" counted from the latest cycle Day 1 on or before this date;
   *  null when cycle tracking is off or there is no Day 1 to count from. */
  cycleDay: number | null;
}

interface State {
  loading: boolean;
  days: DayData[];
  timeFormat: TimeFormat;
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
  const [state, setState] = useState<State>({ loading: true, days: [], timeFormat: '12hr' });

  const load = useCallback(async () => {
    if (!user) return;
    setState(prev => ({ ...prev, loading: true }));

    const todayStr = dateToString(new Date());
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromStr = dateToString(ninetyDaysAgo);

    const bodyTrackingEnabled = profile?.body_tracking_enabled ?? false;
    const cycleTrackingEnabled = profile?.cycle_tracking_enabled ?? false;

    const [{ data: checkIns }, { data: sleepLogs }, markers, { data: bodyCheckIns }, { data: bodyEventsData }, { data: cycleDayOnes }, { data: settings }] = await Promise.all([
      supabase.from('check_ins').select('*').eq('user_id', user.id).gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: false }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', fromStr).order('log_date', { ascending: false }),
      fetchMarkersInRange(fromStr, todayStr).catch(() => [] as InterventionMarker[]),
      bodyTrackingEnabled
        ? supabase.from('body_checkins').select('*').eq('user_id', user.id).gte('entry_date', fromStr)
        : Promise.resolve({ data: [] as BodyCheckIn[] }),
      bodyTrackingEnabled
        ? supabase.from('body_events').select('*, body_event_sites(*)').eq('user_id', user.id).gte('event_date', fromStr)
        : Promise.resolve({ data: [] as (BodyEvent & { body_event_sites: BodyEventSite[] })[] }),
      // Every Day 1, not just the 90-day window's: the first days in view
      // count from a Day 1 that may have been logged before the window.
      // Every cycle_phase marker is a Day 1 since the phase engine was cut.
      cycleTrackingEnabled
        ? supabase.from('intervention_markers').select('marker_date').eq('user_id', user.id).eq('marker_type', 'cycle_phase').order('marker_date', { ascending: true })
        : Promise.resolve({ data: [] as { marker_date: string }[] }),
      // For the times on check-in notes, in the person's 12/24-hour choice.
      supabase.from('check_in_settings').select('time_format').eq('user_id', user.id).maybeSingle(),
    ]);
    const dayOneDates = (cycleDayOnes ?? []).map(m => m.marker_date);

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
    const emptyDay = (date: string): DayData => ({ date, checkIns: [], sleepLog: null, markers: markersByDate.get(date) ?? [], ...bodyFor(date), cycleDay: cycleDayForDate(date, dayOneDates) });

    dayMap.set(todayStr, emptyDay(todayStr));

    checkIns?.forEach(ci => {
      const date = dateToString(ensureUTC(ci.scheduled_at));
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
    const thirtyDaysAgoStr = dateToString(thirtyDaysAgo);
    const hasDataBeyond30Days = sorted.some(d => d.date < thirtyDaysAgoStr);

    setState({ loading: false, timeFormat: (settings?.time_format as TimeFormat | undefined) ?? '12hr', days: hasDataBeyond30Days ? sorted : sorted.filter(d => d.date >= thirtyDaysAgoStr) });
  }, [user, profile?.body_tracking_enabled, profile?.cycle_tracking_enabled]);

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
