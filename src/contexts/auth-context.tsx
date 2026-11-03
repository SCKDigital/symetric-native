import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';

import { identifyUser, resetUser } from '@/lib/analytics';
import { buildEmailRedirectUrl } from '@/lib/auth-deep-link';
import { removeThisDevicePushToken } from '@/lib/push-notifications';
import { Profile, supabase } from '@/lib/supabase';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const fetchGenRef = useRef(0);

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData ?? null);
    }
  };

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
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
          let profileData = await fetchProfileWithRetry(session.user.id);
          if (gen !== fetchGenRef.current) return;
          if (profileData && !profileData.timezone) {
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
