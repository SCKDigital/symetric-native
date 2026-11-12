import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { cycleDayForDate, dateToString, ensureUTC } from '@/lib/date-utils';
import { readCache, writeCache } from '@/lib/offline/cache';
import { isOnline, subscribeOnline } from '@/lib/offline/connectivity';
import { onSynced } from '@/lib/offline/outbox';
import { overlayBody, overlayCheckIns, overlayMarkers, overlaySleepLogs, pendingBonusCheckIns } from '@/lib/offline/overlays';
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

/** Everything History read, as it came back — what's kept for offline use. */
interface HistoryRaw {
  fromStr: string;
  checkIns: CheckIn[];
  sleepLogs: SleepLog[];
  markers: InterventionMarker[];
  bodyCheckIns: BodyCheckIn[];
  bodyEvents: (BodyEvent & { body_event_sites: BodyEventSite[] })[];
  bodyPainSites: BodyPainSite[];
  dayOneDates: string[];
  timeFormat: TimeFormat;
}

interface State {
  loading: boolean;
  /** The read failed and nothing was saved to fall back on: what's shown is
   *  only the entries made on this phone, not the person's history. */
  offlineUnavailable: boolean;
  /** Showing the saved copy rather than a fresh read. */
  offlineCopy: boolean;
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
  const [state, setState] = useState<State>({ loading: true, offlineUnavailable: false, offlineCopy: false, days: [], timeFormat: '12hr' });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    // A reload triggered by a sync keeps the list on screen.
    if (!opts?.silent) setState(prev => ({ ...prev, loading: true }));

    const todayStr = dateToString(new Date());
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromStr = dateToString(ninetyDaysAgo);

    const bodyTrackingEnabled = profile?.body_tracking_enabled ?? false;
    const cycleTrackingEnabled = profile?.cycle_tracking_enabled ?? false;

    const [checkInsRes, sleepLogsRes, markersRes, bodyCheckInsRes, bodyEventsRes, cycleDayOnesRes, settingsRes] = await Promise.all([
      supabase.from('check_ins').select('*').eq('user_id', user.id).gte('scheduled_at', ninetyDaysAgo.toISOString()).order('scheduled_at', { ascending: false }),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('log_date', fromStr).order('log_date', { ascending: false }),
      fetchMarkersInRange(fromStr, todayStr).then(data => ({ data, error: null }), error => ({ data: null, error })),
      bodyTrackingEnabled
        ? supabase.from('body_checkins').select('*').eq('user_id', user.id).gte('entry_date', fromStr)
        : Promise.resolve({ data: [] as BodyCheckIn[], error: null }),
      bodyTrackingEnabled
        ? supabase.from('body_events').select('*, body_event_sites(*)').eq('user_id', user.id).gte('event_date', fromStr)
        : Promise.resolve({ data: [] as (BodyEvent & { body_event_sites: BodyEventSite[] })[], error: null }),
      // Every Day 1, not just the 90-day window's: the first days in view
      // count from a Day 1 that may have been logged before the window.
      // Every cycle_phase marker is a Day 1 since the phase engine was cut.
      cycleTrackingEnabled
        ? supabase.from('intervention_markers').select('marker_date').eq('user_id', user.id).eq('marker_type', 'cycle_phase').order('marker_date', { ascending: true })
        : Promise.resolve({ data: [] as { marker_date: string }[], error: null }),
      // For the times on check-in notes, in the person's 12/24-hour choice.
      supabase.from('check_in_settings').select('time_format').eq('user_id', user.id).maybeSingle(),
    ]);

    let raw: HistoryRaw = {
      fromStr,
      checkIns: (checkInsRes.data ?? []) as CheckIn[],
      sleepLogs: (sleepLogsRes.data ?? []) as SleepLog[],
      markers: (markersRes.data ?? []) as InterventionMarker[],
      bodyCheckIns: (bodyCheckInsRes.data ?? []) as BodyCheckIn[],
      bodyEvents: (bodyEventsRes.data ?? []) as (BodyEvent & { body_event_sites: BodyEventSite[] })[],
      bodyPainSites: [],
      dayOneDates: ((cycleDayOnesRes.data ?? []) as { marker_date: string }[]).map(m => m.marker_date),
      timeFormat: (settingsRes.data?.time_format as TimeFormat | undefined) ?? '12hr',
    };
    let failed = [checkInsRes, sleepLogsRes, markersRes, bodyCheckInsRes, bodyEventsRes, cycleDayOnesRes, settingsRes]
      .some(r => r.error);
    if (!failed && raw.bodyCheckIns.length) {
      const sitesRes = await supabase.from('body_pain_sites').select('*').in('body_checkin_id', raw.bodyCheckIns.map(c => c.id));
      raw.bodyPainSites = (sitesRes.data ?? []) as BodyPainSite[];
      failed = !!sitesRes.error;
    }
    // A failed read, almost always no connection, shows the last full read
    // instead of an empty history. Only a read that came back whole is kept,
    // so a half-failed one can never overwrite a good copy.
    let offlineCopy = false;
    let offlineUnavailable = false;
    if (failed) {
      const cached = await readCache<HistoryRaw>(user.id, 'history');
      if (cached) raw = cached;
      offlineCopy = !!cached;
      offlineUnavailable = !cached;
    } else {
      writeCache(user.id, 'history', raw);
    }

    // Entries still waiting to sync, laid over what was read.
    const checkIns = [...overlayCheckIns(raw.checkIns), ...pendingBonusCheckIns()]
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
    const sleepLogs = overlaySleepLogs(raw.sleepLogs, user.id);
    const markers = overlayMarkers(raw.markers);
    const body = bodyTrackingEnabled
      ? overlayBody(raw.bodyCheckIns, raw.bodyPainSites, raw.bodyEvents, user.id)
      : { checkins: [], painSites: [], events: [] };
    const bodyCheckIns = body.checkins;
    const bodyEvents = body.events;
    const bodyPainSites = body.painSites;
    const dayOneDates = raw.dayOneDates;

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

    setState({ loading: false, offlineUnavailable, offlineCopy, timeFormat: raw.timeFormat, days: hasDataBeyond30Days ? sorted : sorted.filter(d => d.date >= thirtyDaysAgoStr) });
  }, [user, profile?.body_tracking_enabled, profile?.cycle_tracking_enabled]);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment —
    // same shape: a locally-defined async fetch function called on mount,
    // which the linter traces into and flags even though the setState calls
    // inside load() only run after its internal awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Re-read once entries reach the server, and when the connection returns,
  // so the offline copy gives way to the real one without a manual refresh.
  useEffect(() => {
    const offSynced = onSynced(() => { load({ silent: true }); });
    const offOnline = subscribeOnline(() => { if (isOnline()) load({ silent: true }); });
    return () => { offSynced(); offOnline(); };
  }, [load]);

  return { ...state, refresh: () => load() };
}
