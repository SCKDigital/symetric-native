import { DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthScreen } from '@/components/auth/auth-screen';
import AppTabs from '@/components/app-tabs';
import Onboarding from '@/components/onboarding/onboarding';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { trySetSessionFromUrl } from '@/lib/auth-deep-link';

SplashScreen.preventAutoHideAsync();

// Symetric has no light theme (see src/constants/theme.ts) — always DarkTheme,
// not driven by useColorScheme like the template default was.
export default function RootLayout() {
  return (
    // Required at the app root for react-native-gesture-handler to work
    // reliably (especially on Android) — needed once Prepare's question
    // list added drag-to-reorder via react-native-draggable-flatlist.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Mirrors the web app's App.tsx: a top-level conditional on auth/onboarding
// state rather than route guards — same four gates, in the same order (no
// session -> AuthScreen, profile still resolving -> pulse logo, onboarding
// incomplete -> Onboarding, else the tab shell). The `profile === undefined`
// gate matters even though `loading` already covers the *first* profile
// fetch: onAuthStateChange sets profile back to undefined on every fresh
// sign-in event (including the one the magic-link deep link fires) without
// re-flipping `loading` back to true, since `session` itself updates
// synchronously a tick earlier — so this app briefly had `session` truthy
// with `profile` still undefined, which would have flashed the tab shell
// (or worse, the onboarding gate reading a stale/missing profile) for a
// moment. This is also where the one native-only auth mechanic lives:
// catching the magic-link deep link, both cold-start (getInitialURL) and
// while already running (the 'url' event), and handing it to Supabase via
// trySetSessionFromUrl.
function AuthGate() {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) trySetSessionFromUrl(url).catch(err => console.error('Auth deep link (cold start) failed:', err));
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      trySetSessionFromUrl(url).catch(err => console.error('Auth deep link failed:', err));
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;
  if (!session) return <AuthScreen />;
  if (profile === undefined) return <PulseLoadingScreen />;
  if (!profile?.onboarding_complete) return <Onboarding />;

  return <AppTabs />;
}
