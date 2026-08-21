import { getQueryParams } from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

/**
 * On the web app, Supabase's `detectSessionInUrl` reads the session straight
 * out of the browser's address bar after the magic-link redirect — there's
 * no equivalent here, since a native app has no address bar for the redirect
 * to land in. Instead the email link opens the app via a deep link (the
 * `symetric://` scheme in app.json), and whichever screen is listening for
 * that link has to pull the session out of its query params itself.
 *
 * `Linking.createURL` resolves to the right form for wherever this build is
 * actually running — Expo Go's `exp://…` tunnel in dev, `symetric://` in a
 * standalone/EAS build — so the redirect Supabase is told about always
 * matches the deep link the OS will actually hand back to this app.
 */
export function buildEmailRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/**
 * Call with whatever URL opened the app (from `Linking.getInitialURL()` on
 * cold start, or the `Linking` `'url'` event while already running). Returns
 * true if the URL actually carried a session to establish, false if it was
 * unrelated to auth (or already handled/expired) — callers shouldn't treat
 * "no session in this URL" as an error.
 */
export async function trySetSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return false;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return true;
}
