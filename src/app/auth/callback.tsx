import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { trySetSessionFromUrl } from '@/lib/auth-deep-link';

// The magic-link redirect built by lib/auth-deep-link.ts is
// `<scheme>/auth/callback`, so expo-router resolves it as a route as well as
// handing it to _layout.tsx's Linking listener. Without a file here that
// resolution failed and the router rendered its "Unmatched Route" screen over
// the app — the session was actually established underneath, but sign-in
// looked broken. This route exists to be that match: it re-runs
// trySetSessionFromUrl (idempotent — setSession with the same tokens is a
// no-op, and a URL carrying no tokens returns false rather than throwing)
// purely so the flow still completes if the listener missed the URL, then
// sends the user to the tab shell. AuthGate decides what actually renders
// there; this screen never gates anything itself.
export default function AuthCallbackScreen() {
  const url = useLinkingURL();

  useEffect(() => {
    let cancelled = false;

    const finish = () => {
      if (!cancelled) router.replace('/');
    };

    if (!url) {
      finish();
      return;
    }

    trySetSessionFromUrl(url)
      .catch(err => console.error('Auth deep link (callback route) failed:', err))
      .finally(finish);

    return () => {
      cancelled = true;
    };
  }, [url]);

  return <PulseLoadingScreen />;
}
