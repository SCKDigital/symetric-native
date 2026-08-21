import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';

import { identifyUser, resetUser } from '@/lib/analytics';
import { buildEmailRedirectUrl } from '@/lib/auth-deep-link';
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
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const fetchGenRef = useRef(0);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return undefined;
    }

    return data;
  };

  const fetchProfileWithRetry = async (userId: string) => {
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
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData ?? null);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        (async () => {
          const gen = ++fetchGenRef.current;
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            const profileData = await fetchProfileWithRetry(session.user.id);
            if (gen !== fetchGenRef.current) return;
            setProfile(profileData ?? null);
          } else {
            setProfile(null);
          }

          clearTimeout(timeout);
          setLoading(false);
        })();
      })
      .catch(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);

        // A silent token refresh doesn't change who's signed in — only
        // re-fetch the profile (and flash the loading screen via
        // `profile === undefined`) on events that represent an actual
        // identity change.
        if (_event === 'TOKEN_REFRESHED') return;

        if (session?.user) {
          identifyUser(session.user.id);
          const gen = ++fetchGenRef.current;
          setProfile(undefined);
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
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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
