import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { resolveActiveDomains } from '@/lib/domains';
import { supabase } from '@/lib/supabase';

interface State {
  userId: string | null;
  mindSetupComplete: boolean | undefined;
}

/**
 * Ported from the web app's App.tsx — computes whether MIND setup
 * (domains/baselines/schedule) is done, once per onboarded user. A brand-new
 * user has no check_in_settings row at all, which correctly resolves to an
 * empty domain list via resolveActiveDomains. undefined = still checking.
 *
 * The web version resets via a separate effect keyed on user.id. Ported here
 * as a render-time reset instead — React's documented pattern for "adjusting
 * state when a prop changes" — since an effect that calls setState
 * synchronously on every run is exactly the shape React's own hooks lint now
 * flags; this achieves the same reset without that.
 */
export function useMindSetupStatus() {
  const { user, profile } = useAuth();
  const [state, setState] = useState<State>({ userId: null, mindSetupComplete: undefined });

  const userId = user?.id ?? null;
  if (state.userId !== userId) {
    setState({ userId, mindSetupComplete: undefined });
  }

  useEffect(() => {
    if (!user || !profile?.onboarding_complete) return;
    if (state.mindSetupComplete !== undefined) return;

    supabase
      .from('check_in_settings')
      .select('active_domains, quick_checkin_domains')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const complete = resolveActiveDomains(data).length > 0;
        setState(prev => (prev.userId === user.id ? { ...prev, mindSetupComplete: complete } : prev));
      });
  }, [user, profile?.onboarding_complete, state.mindSetupComplete, state.userId]);

  return {
    mindSetupComplete: state.mindSetupComplete,
    markComplete: () => setState(prev => ({ ...prev, mindSetupComplete: true })),
  };
}
