import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
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
};

export function useSetupCards(): SetupCardState {
  const { user, profile } = useAuth();
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!user || !profile) return;

    const [settingsRes, cycleMarkerRes] = await Promise.all([
      supabase
        .from('check_in_settings')
        .select('active_domains, quick_checkin_domains, setup_times_confirmed_at, setup_notifications_ack_at, setup_preferences_ack_at, time_format')
        .eq('user_id', user.id)
        .maybeSingle(),
      // Only asked for when cycle tracking is on, and only to find out whether
      // a Day 1 has ever been recorded — one row is enough to answer that.
      profile.cycle_tracking_enabled
        ? supabase
            .from('intervention_markers')
            .select('id')
            .eq('user_id', user.id)
            .eq('marker_type', 'cycle_phase')
            .limit(1)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);

    const settings = settingsRes.data;
    const hasCycleMarker = (cycleMarkerRes.data ?? []).length > 0;

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
    });
  }, [user, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, refresh: load };
}
