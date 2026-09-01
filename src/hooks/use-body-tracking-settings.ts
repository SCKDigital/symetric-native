import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { BodyDomainType, Profile } from '@/lib/supabase';
import { BODY_DOMAINS } from '@/lib/body/constants';

interface Options {
  /** Domains to show active when profile.body_domains_active is empty/unset. */
  defaultDomains?: BodyDomainType[];
  onError?: (message: string) => void;
}

/**
 * Direct port of the web app's src/hooks/useBodyTrackingSettings.ts, logic
 * unchanged — body-tracking domain/timing state, synced from the profile
 * and saved back to it.
 */
export function useBodyTrackingSettings(
  userId: string | undefined,
  profile: Profile | null | undefined,
  refreshProfile: () => Promise<void>,
  { defaultDomains = [], onError }: Options = {},
) {
  const [bodyDomainsActive, setBodyDomainsActive] = useState<BodyDomainType[]>(defaultDomains);
  const [bodyAvailableFrom, setBodyAvailableFrom] = useState('17:00');
  const [bodyReminderTime, setBodyReminderTime] = useState('21:00');
  const [bodyMorningEnabled, setBodyMorningEnabled] = useState(false);
  const [bodyMorningTime, setBodyMorningTime] = useState('08:00');

  // Each of these syncs local editable state to `profile`, which arrives
  // asynchronously (fetched separately from this hook's own mount, and can
  // change again later via refreshProfile) — one of React's own documented
  // legitimate uses of an effect ("adjusting state when a prop changes"),
  // same reasoning as Prepare's PatternRow note-sync effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBodyDomainsActive(profile?.body_domains_active?.length ? profile.body_domains_active : defaultDomains);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.body_domains_active]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBodyAvailableFrom(profile?.body_available_from?.slice(0, 5) ?? '17:00'); }, [profile?.body_available_from]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBodyReminderTime(profile?.body_reminder_time?.slice(0, 5) ?? '21:00'); }, [profile?.body_reminder_time]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBodyMorningEnabled(profile?.body_morning_enabled ?? false); }, [profile?.body_morning_enabled]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBodyMorningTime(profile?.body_morning_time?.slice(0, 5) ?? '08:00'); }, [profile?.body_morning_time]);

  const handleToggleBodyDomain = async (domain: BodyDomainType) => {
    if (!userId || BODY_DOMAINS[domain].required) return;
    const prev = bodyDomainsActive;
    const next = prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain];
    setBodyDomainsActive(next);
    const { error } = await supabase.from('profiles').update({ body_domains_active: next }).eq('id', userId);
    if (error) {
      setBodyDomainsActive(prev);
      onError?.('Failed to save changes. Please try again.');
    } else {
      await refreshProfile();
    }
  };

  const handleSaveBodyTiming = async (availableFrom: string, reminderTime: string, morningEnabled: boolean, morningTime: string) => {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({
      body_available_from: availableFrom,
      body_reminder_time: reminderTime,
      body_morning_enabled: morningEnabled,
      body_morning_time: morningTime,
    }).eq('id', userId);
    if (error) throw error;
    setBodyAvailableFrom(availableFrom);
    setBodyReminderTime(reminderTime);
    setBodyMorningEnabled(morningEnabled);
    setBodyMorningTime(morningTime);
    await refreshProfile();
  };

  return {
    bodyDomainsActive,
    bodyAvailableFrom,
    bodyReminderTime,
    bodyMorningEnabled,
    bodyMorningTime,
    setBodyMorningEnabled,
    handleToggleBodyDomain,
    handleSaveBodyTiming,
  };
}
