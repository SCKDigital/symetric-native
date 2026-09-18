import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
import { supabase } from '@/lib/supabase';

/**
 * Which first-run setup cards Today should still be showing.
 *
 * Onboarding stops after the consent screens. Everything the old MindSetup
 * wizard blocked on — domains, check-in times, body symptoms — is a card on the
 * home screen instead, so a new user lands in the actual app and fills these in
 * from there. Each card disappears the moment its job is done.
 *
 * Three of the five have a dedicated column because their state can't be
 * inferred: check_in_settings' columns all have NOT NULL defaults, so the row
 * existing says nothing about the times card; profiles.push_enabled records
 * only success, so it can't tell "declined" from "never asked"; and the cycle
 * prompt needs somewhere to record "no thanks". The other two read data that
 * already means something — an empty active_domains, and an existing
 * cycle_phase marker.
 *
 * Body uses profiles.body_setup_complete, which already existed and was already
 * documented for exactly this card.
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
  /** True while any card is outstanding — Today hides its normal content
   *  behind this so setup reads as one job rather than a scattered nag. */
  anyOutstanding: boolean;
  refresh: () => void;
}

const EMPTY: Omit<SetupCardState, 'refresh'> = {
  loading: true,
  needsNotifications: false,
  needsMindDomains: false,
  needsTimes: false,
  needsBodySetup: false,
  needsCycleDayOne: false,
  anyOutstanding: false,
};

export function useSetupCards(): SetupCardState {
  const { user, profile } = useAuth();
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!user || !profile) return;

    const [settingsRes, cycleMarkerRes] = await Promise.all([
      supabase
        .from('check_in_settings')
        .select('active_domains, quick_checkin_domains, setup_times_confirmed_at, setup_notifications_ack_at')
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

    setState({
      loading: false,
      needsNotifications,
      needsMindDomains,
      needsTimes,
      needsBodySetup,
      needsCycleDayOne,
      anyOutstanding:
        needsNotifications || needsMindDomains || needsTimes || needsBodySetup || needsCycleDayOne,
    });
  }, [user, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, refresh: load };
}
