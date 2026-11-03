import * as Linking from 'expo-linking';

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
    return Promise.reject(new Error(params.error_description || params.error_code || params.error));
  }

  const { code } = params;
  if (!code) return Promise.resolve(false);

  let pending = exchanges.get(code);
  if (!pending) {
    pending = supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) throw error;
      return true;
    });
    exchanges.set(code, pending);
  }
  return pending;
}
