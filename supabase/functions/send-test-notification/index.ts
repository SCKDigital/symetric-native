/**
 * send-test-notification — Supabase Edge Function
 *
 * Called directly by the client (authenticated). Sends a single test
 * notification to the calling user through every channel they have a stored
 * subscription/token for — Web Push (browser) and/or Expo push
 * (symetric-native) — and reports each channel's outcome independently, so a
 * failure on one never masks success on the other.
 *
 * Required Supabase secrets (same as send-notifications):
 *   VAPID_PRIVATE_KEY
 *   VAPID_CONTACT_EMAIL
 * Expo push needs no secret — see expopush.ts.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendWebPush } from '../_shared/webpush.ts';
import { fetchExpoPushReceipts, sendExpoPushBatch } from '../_shared/expopush.ts';

// ── CORS headers (required when JWT verification is disabled) ─────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight — must return 200 before any auth checks.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    // ── 1. Env vars ────────────────────────────────────────────────────────────
    // VAPID vars are only required if the user turns out to have a web
    // subscription (checked in step 3) — Expo-only users need neither, so
    // this no longer fails the whole request just because VAPID is unset.
    let supabaseUrl: string, serviceRoleKey: string, vapidPrivateKey: string, contactEmail: string;
    try {
      supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
      serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
      contactEmail   = Deno.env.get('VAPID_SUBJECT') ?? Deno.env.get('VAPID_CONTACT_EMAIL') ?? '';
      console.log('[test-notif] env ok — supabaseUrl:', !!supabaseUrl, 'serviceRoleKey:', !!serviceRoleKey, 'vapidPrivateKey:', !!vapidPrivateKey, 'contactEmail:', !!contactEmail);
    } catch (e) {
      console.error('[test-notif] env error:', e);
      return new Response(JSON.stringify({ error: `env: ${(e as Error).message}` }), { status: 500, headers: CORS });
    }

    // ── 2. Auth ────────────────────────────────────────────────────────────────
    // Admin path: POST body may contain { targetUserId } when called with the
    // service role key. This lets developers test any user's subscription without
    // needing that user's JWT (useful for debugging specific user IDs).
    let userId: string;
    try {
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      // Check for admin-targeting: service role key + targetUserId in body
      if (token === serviceRoleKey && req.method === 'POST') {
        let body: { targetUserId?: string } = {};
        try { body = await req.json(); } catch { /* no body */ }
        if (body.targetUserId) {
          userId = body.targetUserId;
          console.log('[test-notif] admin path — targetUserId:', userId);
        } else {
          throw new Error('Service role key provided but no targetUserId in body');
        }
      } else {
        // Normal path: validate JWT and use the calling user's ID
        console.log('[test-notif] auth token present:', !!token);
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
        if (userError) throw new Error(`auth.getUser error: ${userError.message}`);
        if (!user)     throw new Error('auth.getUser returned no user');
        userId = user.id;
        console.log('[test-notif] authenticated userId:', userId);
      }
    } catch (e) {
      console.error('[test-notif] auth error:', e);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }

    // ── 3. Fetch subscription(s) — web + native, both optional ─────────────────
    // Unlike the old single-channel version, this doesn't 404 unless BOTH are
    // missing — a native-only or web-only user is a normal case, not an error.
    let sub: { endpoint: string; p256dh: string; auth: string } | null = null;
    let expoToken: string | null = null;
    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const [{ data: webRows, error: webError }, { data: expoRows, error: expoError }] = await Promise.all([
        adminClient
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        adminClient
          .from('expo_push_tokens')
          .select('token')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      if (webError) throw new Error(`db error (web): ${webError.message}`);
      if (expoError) throw new Error(`db error (expo): ${expoError.message}`);
      sub = webRows && webRows.length > 0 ? webRows[0] : null;
      expoToken = expoRows && expoRows.length > 0 ? expoRows[0].token : null;
      if (!sub && !expoToken) throw new Error('no_subscription');
      console.log('[test-notif] found — web:', !!sub, 'expo:', !!expoToken);
    } catch (e) {
      const msg = (e as Error).message;
      console.error('[test-notif] subscription error:', e);
      if (msg === 'no_subscription') {
        return new Response(JSON.stringify({ error: 'no_subscription' }), { status: 404, headers: CORS });
      }
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS });
    }

    // ── 4. Send on every channel the user has a row for ─────────────────────────
    // Each channel's send is independent — a failure on one is reported in
    // `outcomes` without preventing the other channel's attempt or masking its
    // result. Matches send-notifications' own "additive, never blocks the other
    // channel" isolation.
    const title = 'Symetric';
    const body = 'Test notification from Symetric - delivery is working.';
    const outcomes: Array<{ channel: 'web' | 'expo'; ok: boolean; error?: string }> = [];

    if (sub) {
      try {
        if (!vapidPrivateKey || !contactEmail) throw new Error('VAPID_PRIVATE_KEY / VAPID_CONTACT_EMAIL secret is not set');
        console.log('[test-notif] sending web push...');
        const payload = JSON.stringify({ title, body });
        const res = await sendWebPush(sub, payload, vapidPrivateKey, contactEmail);
        console.log('[test-notif] web push response status:', res.status);

        if (res.ok || res.status === 201) {
          outcomes.push({ channel: 'web', ok: true });
        } else if (res.status === 410 || res.status === 404) {
          const adminClient = createClient(supabaseUrl, serviceRoleKey);
          await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          outcomes.push({ channel: 'web', ok: false, error: 'subscription_expired' });
        } else {
          const resBody = await res.text();
          console.error('[test-notif] web push service error:', res.status, resBody);
          outcomes.push({ channel: 'web', ok: false, error: `push_failed: ${resBody}` });
        }
      } catch (e) {
        console.error('[test-notif] web push threw:', e);
        outcomes.push({ channel: 'web', ok: false, error: (e as Error).message });
      }
    }

    if (expoToken) {
      try {
        console.log('[test-notif] sending expo push...');
        const [result] = await sendExpoPushBatch([{ to: expoToken, title, body }]);
        if (result.ok) {
          // A ticket only means Expo accepted the message. Whether APNs/FCM
          // actually took it is in the receipt, and that is the only place a
          // credentials problem ever appears — without this check, an app
          // with missing or revoked FCM credentials passes its own delivery
          // test every time while delivering nothing. This is the one caller
          // that can afford to wait for it: a single message, on a path a
          // human is watching.
          const receipt = result.receiptId
            ? await (async () => {
              await new Promise((r) => setTimeout(r, 3000));
              return (await fetchExpoPushReceipts([result.receiptId!])).get(result.receiptId!);
            })()
            : undefined;

          if (receipt?.status === 'error') {
            const code = receipt.error ?? receipt.message ?? 'delivery_failed';
            console.error('[test-notif] expo receipt error:', code, receipt.message);
            if (receipt.error === 'DeviceNotRegistered') {
              const adminClient = createClient(supabaseUrl, serviceRoleKey);
              await adminClient.from('expo_push_tokens').delete().eq('token', expoToken);
            }
            outcomes.push({ channel: 'expo', ok: false, error: code });
          } else {
            // 'ok', or still pending — pending is not a failure, and saying
            // "sent" for a message Expo has accepted is accurate.
            outcomes.push({ channel: 'expo', ok: true });
          }
        } else {
          if (result.error === 'DeviceNotRegistered') {
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            await adminClient.from('expo_push_tokens').delete().eq('token', expoToken);
          }
          console.error('[test-notif] expo push error:', result.error);
          outcomes.push({ channel: 'expo', ok: false, error: result.error });
        }
      } catch (e) {
        console.error('[test-notif] expo push threw:', e);
        outcomes.push({ channel: 'expo', ok: false, error: (e as Error).message });
      }
    }

    const anySent = outcomes.some((o) => o.ok);
    if (anySent) {
      return new Response(JSON.stringify({ sent: true, outcomes }), { status: 200, headers: CORS });
    }
    // Backward-compat top-level `error` field: the existing web client
    // (SettingsScreen.tsx's handleSendTestNotification) string-matches
    // body.error for 'no_subscription'/'subscription_expired' — preserve
    // that by surfacing the web channel's error there when it exists (the
    // only channel that client currently sends to), falling back to expo's.
    const primaryError = outcomes.find((o) => o.channel === 'web')?.error ?? outcomes[0]?.error ?? 'unknown';
    return new Response(JSON.stringify({ error: primaryError, outcomes }), { status: 502, headers: CORS });

  } catch (e) {
    // Top-level catch — prevents EarlyDrop by ensuring a response is always returned.
    console.error('[test-notif] unhandled error:', e);
    return new Response(JSON.stringify({ error: `unhandled: ${(e as Error).message}` }), { status: 500, headers: CORS });
  }
});
