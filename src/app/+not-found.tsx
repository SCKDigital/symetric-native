import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { trySetSessionFromUrl } from '@/lib/auth-deep-link';

/**
 * Replaces expo-router's built-in "Unmatched Route" screen.
 *
 * The magic-link deep link (`symetric://auth/callback#access_token=…`) was
 * landing on that screen in production, and adding src/app/auth/callback.tsx
 * did not stop it — verified the route compiles into the shipped bundle, that
 * extractExactPathFromURL resolves the URL to exactly `auth/callback`, and
 * that `href: null` only hides the tab button rather than removing the screen.
 * The route should match. It doesn't, and the reason isn't visible statically;
 * the likeliest cause is that src/app/_layout.tsx mounts no navigator at all
 * in four of its six auth states — including signed-out, which is precisely
 * the state a magic link arrives in — so there is nothing to render the route
 * on until AuthGate swaps in the tab shell.
 *
 * Rather than keep guessing at that, this takes the one thing that is known
 * for certain: the unmatched screen *does* render. So this catches whatever
 * URL failed to match, hands it to trySetSessionFromUrl (idempotent, and a
 * no-op for a URL carrying no tokens), and sends the user to the tab shell —
 * where AuthGate decides what they actually see. A user tapping their magic
 * link now gets signed in instead of a dead end, whatever the routing did.
 *
 * It also means any other unmatched deep link recovers to the app rather than
 * a developer-facing error screen with a "Sitemap" link on it.
 */
export default function NotFoundScreen() {
  const url = useLinkingURL();

  useEffect(() => {
    let cancelled = false;
    const goHome = () => {
      if (!cancelled) router.replace('/');
    };

    if (!url) {
      goHome();
      return;
    }

    trySetSessionFromUrl(url)
      .catch(err => console.error('Auth deep link (not-found catch-all) failed:', err))
      .finally(goHome);

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Never the app's real loading state — this screen exists for the moment
  // between a failed match and the redirect, so it should read as "working",
  // not as an error.
  return <PulseLoadingScreen />;
}
