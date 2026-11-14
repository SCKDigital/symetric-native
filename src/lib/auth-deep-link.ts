import * as Linking from 'expo-linking';
import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * On the web app, Supabase's `detectSessionInUrl` reads the session straight
 * out of the browser's address bar after the magic-link redirect — there's
 * no equivalent here, since a native app has no address bar for the redirect
 * to land in. Instead the email link opens the app via a deep link (the
 * `symetric://` scheme in app.json), and whichever screen is listening for
 * that link has to finish the sign-in itself.
 *
 * `Linking.createURL` resolves to the right form for wherever this build is
 * actually running — Expo Go's `exp://…` tunnel in dev, `symetric://` in a
 * standalone/EAS build — so the redirect Supabase is told about always
 * matches the deep link the OS will actually hand back to this app.
 */
export function buildEmailRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/** Query string and fragment params together. Supabase reports a failed
 *  verification as `error`/`error_description`, in either place. */
function readParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const add = (part: string | undefined) => {
    if (!part) return;
    for (const pair of part.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
  };
  const [beforeHash, hash] = url.split('#');
  add(beforeHash.split('?')[1]);
  add(hash);
  return params;
}

// ── Why the last link didn't work ─────────────────────────────────────────
//
// A failed link used to be logged and nothing else: the person landed back on
// the sign-in screen with no idea why, and asked for link after link. Each new
// request replaces the one before (the app keeps one PKCE verifier), so that
// made it worse. The sign-in screen now reads this and says what happened.

let linkProblem: string | null = null;
const problemListeners = new Set<() => void>();

function setLinkProblem(message: string | null) {
  linkProblem = message;
  for (const l of problemListeners) l();
}

/** Supabase's own error (in the link): almost always expired or already used. */
function describeLinkError(code: string, description: string): string {
  if (code === 'otp_expired' || /expired|invalid/i.test(description)) {
    return 'That link has expired or has already been used. Send yourself a new one below.';
  }
  return `That link didn’t work (${description || code}). Send yourself a new one below.`;
}

/** No connection when the link was opened: the link itself may still be fine. */
const OFFLINE =
  'Couldn’t reach Symetric to finish signing in. Check your connection, then tap the link in your email again.';

/** The exchange failed: the link reached an install that didn't ask for it. */
const OTHER_INSTALL =
  'That link couldn’t sign you in here. A link only works in the app on the phone that asked for it, ' +
  'and only the newest link works. Send yourself a new one below, then open it on this phone.';

/** The message for the last link that failed, until it's cleared or one works. */
export function useAuthLinkProblem(): string | null {
  return useSyncExternalStore(
    fn => { problemListeners.add(fn); return () => { problemListeners.delete(fn); }; },
    () => linkProblem,
    () => linkProblem,
  );
}

export function clearAuthLinkProblem() {
  if (linkProblem !== null) setLinkProblem(null);
}

// One exchange per code. The link reaches three listeners (the root layout's
// cold-start read and 'url' event, and the callback route), and a PKCE code
// is single-use: a second exchange fails even though the first signed in.
const exchanges = new Map<string, Promise<boolean>>();

/**
 * Call with whatever URL opened the app (from `Linking.getInitialURL()` on
 * cold start, or the `Linking` `'url'` event while already running). Returns
 * true if the URL carried a sign-in code that was exchanged, false if it was
 * unrelated to auth — callers shouldn't treat that as an error.
 *
 * Only a PKCE `code` is accepted, never raw access/refresh tokens. A code can
 * only be exchanged by the device that asked for the link (it holds the
 * matching verifier), whereas accepting tokens let any crafted
 * `symetric://` link sign the user into someone else's account, where what
 * they then logged would be readable by that account's owner.
 */
export function trySetSessionFromUrl(url: string): Promise<boolean> {
  const params = readParams(url);
  if (params.error || params.error_code) {
    setLinkProblem(describeLinkError(params.error_code ?? '', params.error_description ?? params.error ?? ''));
    return Promise.reject(new Error(params.error_description || params.error_code || params.error));
  }

  const { code } = params;
  if (!code) return Promise.resolve(false);

  let pending = exchanges.get(code);
  if (!pending) {
    pending = supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        // A dropped connection isn't the link's fault, and the code is still
        // good, so don't send them off to request another.
        const network = error.name === 'AuthRetryableFetchError' || (error as { status?: number }).status === 0;
        if (network) exchanges.delete(code);
        setLinkProblem(network ? OFFLINE : OTHER_INSTALL);
        throw error;
      }
      setLinkProblem(null);
      return true;
    }, (err: unknown) => {
      // The call itself threw rather than returning an error: a network
      // failure on the way out. Same as the offline case above.
      exchanges.delete(code);
      setLinkProblem(OFFLINE);
      throw err;
    });
    exchanges.set(code, pending);
  }
  return pending;
}
