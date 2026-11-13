import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
import { overlayCheckInSettings } from '@/lib/offline/overlays';
import { pendingPayloads } from '@/lib/offline/outbox';
import { readThrough } from '@/lib/offline/read-through';
import { supabase } from '@/lib/supabase';
import type { TimeFormat } from '@/lib/time-format';

/**
 * Which first-run setup cards Today should still be showing.
 *
 * Onboarding stops after the consent screens. Everything the old MindSetup
 * wizard blocked on — domains, check-in times, body symptoms — is a card on the
 * home screen instead, so a new user lands in the actual app and fills these in
 * from there. Each card disappears the moment its job is done.
 *
 * Four of the six have a dedicated column because their state can't be
 * inferred: check_in_settings' columns all have NOT NULL defaults, so the row
 * existing says nothing about the times card; profiles.push_enabled records
 * only success, so it can't tell "declined" from "never asked"; and the cycle
 * prompt needs somewhere to record "no thanks". The other two read data that
 * already means something — an empty active_domains, and an existing
 * cycle_phase marker.
 *
 * Body uses profiles.body_setup_complete, which already existed and was already
 * documented for exactly this card.
 *
 * The sixth card — app lock and comfort mode — is the only one that asks for
 * nothing the app needs, so declining it has to stick: both answering and
 * dismissing stamp setup_preferences_ack_at. See
 * 20260918000003_setup_preferences_card.sql.
 */
export interface SetupCardState {
  loading: boolean;
  /** Reminders. The app schedules check-ins at unpredictable times; without a
   *  notification there is nothing to tell you one is due. */
  needsNotifications: boolean;
  needsMindDomains: boolean;
  needsTimes: boolean;
  /** Only ever true when body tracking was opted into at consent. */
  needsBodySetup: boolean;
  /** Only ever true when cycle tracking was opted into at consent. Optional:
   *  it backfills Day-N context rather than enabling anything. */
  needsCycleDayOne: boolean;
  /** App lock and comfort mode: the two things the app offers rather than
   *  needs. Shown last, and dismissing counts as answering. */
  needsPreferences: boolean;
  /** True while setup the app actually needs is still outstanding. Today reads
   *  this to suppress its "check in now" nudge, which is why the optional
   *  privacy-and-comfort card is deliberately NOT counted here: declining an
   *  offer must never hold back the thing the app is for. */
  anyOutstanding: boolean;
  /** True when anything at all should render, offers included. */
  anyCardVisible: boolean;
  /** The user's clock preference, so the setup sheets show times the way the
   *  rest of the app will. Read here because this hook already holds the row. */
  timeFormat: TimeFormat;
  /** The mind waking window and check-ins per day, drawn faintly behind the
   *  body check-ins on body setup's day bar. */
  windowStart: string;
  windowEnd: string;
  checkInsPerDay: number;
  refresh: () => void;
}

const EMPTY: Omit<SetupCardState, 'refresh'> = {
  loading: true,
  needsNotifications: false,
  needsMindDomains: false,
  needsTimes: false,
  needsBodySetup: false,
  needsCycleDayOne: false,
  needsPreferences: false,
  anyOutstanding: false,
  anyCardVisible: false,
  timeFormat: '12hr',
  windowStart: '09:00',
  windowEnd: '21:00',
  checkInsPerDay: 3,
};

export function useSetupCards(): SetupCardState {
  const { user, profile } = useAuth();
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!user || !profile) return;

    // Both reads fall back to their last result offline (read-through.ts), so
    // the cards still show, and a step finished offline (queued, see
    // queued-writes.ts) drops off through the overlay below.
    const asResult = <T,>(p: Promise<T>) =>
      p.then(data => ({ data, error: null }), (error: unknown) => ({ data: null, error }));
    const [settingsRes, cycleMarkerRes] = await Promise.all([
      asResult(readThrough('setup.settings', async () => {
        const r = await supabase
          .from('check_in_settings')
          .select('active_domains, quick_checkin_domains, setup_times_confirmed_at, setup_notifications_ack_at, setup_preferences_ack_at, time_format, window_start, window_end, check_ins_per_day')
          .eq('user_id', user.id)
          .maybeSingle();
        if (r.error) throw r.error;
        return r.data;
      })),
      // Only asked for when cycle tracking is on, and only to find out whether
      // a Day 1 has ever been recorded — one row is enough to answer that.
      profile.cycle_tracking_enabled
        ? asResult(readThrough('setup.cycleMarker', async () => {
            const r = await supabase
              .from('intervention_markers')
              .select('id')
              .eq('user_id', user.id)
              .eq('marker_type', 'cycle_phase')
              .limit(1);
            if (r.error) throw r.error;
            return r.data;
          }))
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
    ]);

    // A failed read with nothing saved: show no setup cards rather than guess.
    // A missing settings row reads as "nothing set up yet", which would put
    // every prompt in front of someone who finished setup long ago.
    if (settingsRes.error || cycleMarkerRes.error) return;

    // A setup step finished offline counts as finished.
    const settings = overlayCheckInSettings(settingsRes.data);
    // A Day 1 added offline counts too.
    const hasCycleMarker = (cycleMarkerRes.data ?? []).length > 0
      || pendingPayloads('marker.create').some(m => m.row.marker_type === 'cycle_phase');

    const needsNotifications = !profile.push_enabled && !settings?.setup_notifications_ack_at;
    const needsMindDomains = resolveActiveDomains(settings).length === 0;
    const needsTimes = !settings?.setup_times_confirmed_at;
    const needsBodySetup = profile.body_tracking_enabled === true && profile.body_setup_complete !== true;
    const needsCycleDayOne =
      profile.cycle_tracking_enabled === true
      && !hasCycleMarker
      && !profile.cycle_day_one_prompt_ack_at;
    const needsPreferences = !settings?.setup_preferences_ack_at;

    setState({
      loading: false,
      needsNotifications,
      needsMindDomains,
      needsTimes,
      needsBodySetup,
      needsCycleDayOne,
      needsPreferences,
      anyOutstanding:
        needsNotifications || needsMindDomains || needsTimes || needsBodySetup || needsCycleDayOne,
      anyCardVisible:
        needsNotifications || needsMindDomains || needsTimes || needsBodySetup
        || needsCycleDayOne || needsPreferences,
      timeFormat: (settings?.time_format as TimeFormat | undefined) ?? '12hr',
      windowStart: (settings?.window_start as string | undefined)?.slice(0, 5) ?? EMPTY.windowStart,
      windowEnd: (settings?.window_end as string | undefined)?.slice(0, 5) ?? EMPTY.windowEnd,
      checkInsPerDay: (settings?.check_ins_per_day as number | undefined) ?? EMPTY.checkInsPerDay,
    });
  }, [user, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, refresh: load };
}
