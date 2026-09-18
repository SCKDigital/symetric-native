import { useCallback } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { generateSalt, hashPin } from '@/lib/app-lock';
import { supabase } from '@/lib/supabase';

/**
 * Writing the app-lock PIN, as opposed to enforcing it (use-app-lock.ts).
 *
 * Two callers now — the Settings row and the first-run privacy card — and the
 * write is the security-sensitive half: salt, hash, and clearing both on
 * disable. A second copy of that in a setup sheet is how one of them ends up
 * writing a PIN without a salt, so there is one.
 */
export function useAppLockSettings() {
  const { user, refreshProfile } = useAuth();

  const setPin = useCallback(async (pin: string) => {
    if (!user) throw new Error('Not signed in');
    const salt = generateSalt();
    const hash = await hashPin(pin, salt);
    const { error } = await supabase.from('profiles').update({
      app_lock_enabled: true, app_lock_pin_hash: hash, app_lock_pin_salt: salt,
    }).eq('id', user.id);
    if (error) throw error;
    await refreshProfile();
  }, [user, refreshProfile]);

  const disable = useCallback(async () => {
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase.from('profiles').update({
      app_lock_enabled: false, app_lock_pin_hash: null, app_lock_pin_salt: null,
    }).eq('id', user.id);
    if (error) throw error;
    await refreshProfile();
  }, [user, refreshProfile]);

  return { setPin, disable };
}
