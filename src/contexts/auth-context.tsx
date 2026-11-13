import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';

import { identifyUser, resetUser } from '@/lib/analytics';
import { buildEmailRedirectUrl } from '@/lib/auth-deep-link';
import { readCache, writeCache } from '@/lib/offline/cache';
import { isOnline } from '@/lib/offline/connectivity';
import { readStoredSession } from '@/lib/offline/session';
import { onSynced, useOutbox } from '@/lib/offline/outbox';
import { overlayProfile } from '@/lib/offline/overlays';
import { removeThisDevicePushToken } from '@/lib/push-notifications';
import { clearShareFiles } from '@/lib/share-files';
import { IS_DEMO, Profile, supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null | undefined;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Ported from the web app's src/contexts/AuthContext.tsx — same profile-fetch-
// with-retry (handles the brief race where the profiles row isn't created
// yet), same 8s loading timeout, same TOKEN_REFRESHED short-circuit. Only
// signInWithMagicLink differs: it needs an emailRedirectTo pointing at a deep
// link (see lib/auth-deep-link.ts) since there's no browser URL for Supabase
// to fall back to.
/** One read. Returns undefined on error and null-ish when the row isn't there
 *  yet, which is the distinction fetchProfileWithRetry below retries on. */
async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.error('Error fetching profile:', error);
    return undefined;
  }
  return data;
}

// Module scope, not component scope. It captures nothing — it takes a userId
// and calls the module-level fetchProfile — but living inside the component
// made the auth effect's dependency array look wrong to the linter, and a
// standing warning on the auth path is the last place you want noise. Hoisting
// makes "captures nothing" structural instead of something you have to read the
// body to confirm.
//
// The retries exist because a profile row is created by a trigger on signup,
// and the first read after a brand-new account can land before it commits.
async function fetchProfileWithRetry(userId: string) {
  let data = await fetchProfile(userId);
  // A failed read with no connection isn't the signup race, and waiting three
  // and a half seconds to fail twice more only delays the cached profile.
  if (data === undefined && !isOnline()) return undefined;
  if (data == null) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    data = await fetchProfile(userId);
  }
  if (data == null) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    data = await fetchProfile(userId);
  }
  return data;
}

/** The profile, from the server if it answers, else the last copy on this
 *  phone. Without the fallback a failed read came back as "no profile", and
 *  AuthGate sent an onboarded account offline straight to Onboarding. */
async function loadProfile(userId: string): Promise<{ profile: Profile | null | undefined; fromServer: boolean }> {
  const fetched = await fetchProfileWithRetry(userId);
  if (fetched !== undefined) {
    if (fetched) writeCache(userId, 'profile', fetched);
    return { profile: fetched, fromServer: true };
  }
  const cached = await readCache<Profile>(userId, 'profile');
  return { profile: cached ?? undefined, fromServer: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // The server's copy (or, offline, the last one saved). What the app sees is
  // this with any profile changes still waiting in the outbox laid over it, so
  // a setting changed offline (comfort mode, accent, app lock, body settings)
  // takes effect at once rather than when it reaches the server.
  const [baseProfile, setProfile] = useState<Profile | null | undefined>(undefined);
  const { items: outboxItems } = useOutbox();
  const profile = useMemo(
    () => (baseProfile ? overlayProfile(baseProfile) : baseProfile),
    // Recomputed when the outbox changes, which is when the overlay changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseProfile, outboxItems],
  );
  const [loading, setLoading] = useState(true);
  const fetchGenRef = useRef(0);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      // A failed read keeps the profile already held. Setting null here sent
      // anyone whose refresh happened offline back to Onboarding.
      if (profileData === undefined) return;
      if (profileData) writeCache(user.id, 'profile', profileData);
      setProfile(profileData);
    }
  }, [user]);

  // Once queued profile changes reach the server, take its copy again, so the
  // base catches up with what the overlay was showing.
  useEffect(() => onSynced(types => {
    if (types.includes('profile.update')) refreshProfile();
  }), [refreshProfile]);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);
    // Whose session is currently held. A token refresh, or a repeat SIGNED_IN
    // for the same account, is not a change of identity.
    let currentUserId: string | null = null;

    // No separate getSession() call: subscribing fires INITIAL_SESSION with
    // the stored session, and handling both meant every launch fetched the
    // profile twice.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, reportedSession) => {
      (async () => {
        let session = reportedSession;
        if (!session && _event === 'INITIAL_SESSION' && !IS_DEMO) {
          session = await readStoredSession();
          if (session) console.warn('[auth] session could not be refreshed; continuing on the stored one until online');
        }
        const nextUserId = session?.user?.id ?? null;
        const identityChanged = nextUserId !== currentUserId;
        currentUserId = nextUserId;

        setSession(session);
        // Keep the same User object while the account is unchanged. A token
        // refresh hands back a fresh object for the same person, and two dozen
        // effects are keyed on `user`: each refresh refetched every screen and
        // sent Today through its loading state, which unmounted a check-in the
        // user was halfway through.
        setUser(prev => (prev?.id === nextUserId ? prev : session?.user ?? null));

        if (_event === 'TOKEN_REFRESHED') return;

        if (session?.user) {
          identifyUser(session.user.id);
          const gen = ++fetchGenRef.current;
          // Only a new identity goes back through the loading screen; the
          // same account just gets its profile re-read in place.
          if (identityChanged) setProfile(undefined);
          const loaded = await loadProfile(session.user.id);
          let profileData = loaded.profile;
          if (gen !== fetchGenRef.current) return;
          if (loaded.fromServer && profileData && !profileData.timezone) {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await supabase.from('profiles').update({ timezone: tz }).eq('id', session.user.id);
            profileData = { ...profileData, timezone: tz };
          }
          setProfile(profileData ?? null);
        } else {
          setProfile(null);
        }
        clearTimeout(timeout);
        setLoading(false);
      })().catch(e => {
        console.error('[auth] state change handling failed:', e);
        clearTimeout(timeout);
        setLoading(false);
      });
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: buildEmailRedirectUrl(),
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    // Before the session goes: the row is only deletable while signed in.
    // Left behind, it kept delivering this account's reminders to a device
    // someone else may now be using.
    await removeThisDevicePushToken();
    // Exports and reports written for the share sheet are this account's
    // health data; they must not outlive the session on this phone.
    clearShareFiles();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Offline, or the server rejected the revoke. Signing out of this
      // device must still work; the server-side session expires on its own.
      console.error('[auth] sign-out failed, clearing the local session:', error);
      await supabase.auth.signOut({ scope: 'local' });
    }
    resetUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signInWithMagicLink,
        signOut,
        refreshProfile,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
