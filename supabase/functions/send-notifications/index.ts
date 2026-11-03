/**
 * send-notifications — Supabase Edge Function
 *
 * Called every 2 minutes by pg_cron.
 * Queries check_ins due in a ±90-second window that haven't been notified yet,
 * sends a push notification to every stored subscription/token for the user
 * (Web Push for browser subscribers, Expo push for the symetric-native app —
 * both channels are tried per user, additively, whichever rows exist), then
 * stamps notified_at so subsequent cron runs skip the same check-in.
 *
 * Every Expo-push call site (here, sendBodyReminders, sendMorningBodyReminders)
 * is wrapped in its own try/catch so a failure or misconfiguration on that
 * channel can never prevent the existing Web Push delivery from happening —
 * see expopush.ts's own header for why the two channels need no shared
 * credentials or setup.
 *
 * Required Supabase secrets (set via Dashboard → Settings → Edge Functions):
 *   VAPID_PRIVATE_KEY   — your VAPID private key (base64url, no padding)
 *   VAPID_CONTACT_EMAIL — e.g. "mailto:you@example.com"
 *   CRON_SECRET         — must match the Authorization header sent by the pg_cron job
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 * Expo push needs no secret — exp.host's public send endpoint takes tokens
 * directly, no API key required for this app's usage volume.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { VAPID_PUBLIC_KEY, sendWebPush, vapidPublicKeyToJwkXY } from '../_shared/webpush.ts';
import { fetchExpoPushReceipts, sendExpoPushBatch, summariseReceiptOutcomes } from '../_shared/expopush.ts';

// How long to wait before reading Expo delivery receipts, within the same run.
// Expo recommends 15 minutes and guarantees nothing sooner; this is a
// best-effort check for the errors that resolve immediately, bounded so it
// cannot meaningfully delay a job that runs every two minutes.
const RECEIPT_CHECK_DELAY_MS = 5000;

// ── Comfort mode helper ───────────────────────────────────────────────────────
/**
 * Comfort mode mutes reminder push, but only while an ARMED window is running
 * — profiles.comfort_until in the future. The standing profiles.comfort_mode
 * preference deliberately does not mute anything.
 *
 * That asymmetry is a data-quality decision. checkSustainedDeviationQuality
 * rejects any window below 40% coverage or 1.5 check-ins/day, so a user who
 * turned comfort mode on permanently and stopped being reminded would drift
 * under the floor and pattern detection would quietly stop finding anything.
 * A timestamp always expires, so coverage always recovers by itself.
 *
 * The mute is now also a preference: profiles.comfort_pauses_reminders, true by
 * default. Muting costs real coverage — a check-in expires 30 minutes after it
 * is due, so a two-hour window with the app closed can cost two of them, during
 * exactly the flare the record most needs. Some people want that quiet anyway;
 * others want the nudge. `pausesReminders` defaults to true here as well, so a
 * row read before 20260918000005 lands behaves the way it always has.
 */
function isComfortMuted(
  comfortUntil: string | null | undefined,
  now: Date,
  pausesReminders: boolean | null | undefined = true,
): boolean {
  if (pausesReminders === false) return false;
  if (!comfortUntil) return false;
  const until = new Date(comfortUntil).getTime();
  return !Number.isNaN(until) && until > now.getTime();
}

// ── DND helper ────────────────────────────────────────────────────────────────
// Returns true if UTC instant `now` falls within the user's local DND window.
// dndStart / dndEnd are "HH:MM:SS" or "HH:MM" strings in the user's local time.
// Handles cross-midnight windows (e.g. 22:00–06:00).
function isInDndWindow(now: Date, timezone: string, dndStart: string, dndEnd: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    const nowMins = h * 60 + m;

    const [sh, sm] = dndStart.split(':').map(Number);
    const [eh, em] = dndEnd.split(':').map(Number);
    const startMins = sh * 60 + (sm ?? 0);
    const endMins   = eh * 60 + (em ?? 0);

    if (startMins <= endMins) {
      return nowMins >= startMins && nowMins < endMins;
    }
    // Cross-midnight (e.g. 22:00 – 06:00)
    return nowMins >= startMins || nowMins < endMins;
  } catch {
    return false; // Unknown timezone — don't suppress delivery
  }
}

// ── Expiry sweep (always runs, independent of due check-ins) ─────────────────
// Check-ins that are >2 hours past their scheduled_at and still pending with
// no notified_at will never enter the ±90 s delivery window again. Mark them
// 'expired' so they don't accumulate as stale pending rows.
//
// Convention: status='expired' + notified_at IS NULL means the push never
// succeeded before the check-in aged out. status='expired' + notified_at IS NOT
// NULL means the user was notified but did not complete it before expiry.
//
// The .eq('status', 'pending') guard on the UPDATE acts as an optimistic lock:
// if a concurrent cron run already updated the row, the UPDATE matches 0 rows
// harmlessly rather than overwriting a later status.
async function runExpirySweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<void> {
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const { data: staleCheckIns, error: staleQueryError } = await supabase
    .from('check_ins')
    .select('id')
    .eq('status', 'pending')
    .is('notified_at', null)
    .lt('scheduled_at', twoHoursAgo.toISOString());

  if (staleQueryError) {
    console.error(JSON.stringify({ event: 'stale_query_failed', error: staleQueryError.message }));
    return;
  }

  if (!staleCheckIns || staleCheckIns.length === 0) return;

  const expireResults = await Promise.allSettled(
    staleCheckIns.map(async (ci) => {
      const { error } = await supabase
        .from('check_ins')
        .update({ status: 'expired' })
        .eq('id', ci.id)
        .eq('status', 'pending'); // optimistic lock
      if (error) throw new Error(error.message);
      return ci.id;
    })
  );

  for (const r of expireResults) {
    if (r.status === 'fulfilled') {
      console.log(JSON.stringify({ event: 'expired_unnotified_sweep', check_in_id: r.value }));
    } else {
      console.error(JSON.stringify({ event: 'expire_update_failed', error: r.reason?.message }));
    }
  }
}

// ── Body tracking (alpha) reminder ────────────────────────────────────────────
// Entirely separate from the check_ins delivery loop above: body check-ins have
// no scheduled row to key off, so this is evaluated fresh on every cron tick
// rather than driven by a pre-scheduled ±90s window on a DB row. One
// suppressible push per day is the whole feature — no rescue window, no expiry.
async function sendBodyReminders(
  supabase: ReturnType<typeof createClient>,
  now: Date,
  vapidPrivateKey: string,
  contactEmail: string,
): Promise<{ sent: number; stale: number }> {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, timezone, body_reminder_time, body_reminder_sent_date, comfort_until, comfort_pauses_reminders')
    .eq('body_tracking_enabled', true);

  if (profilesError) {
    console.error(JSON.stringify({ event: 'body_profiles_query_failed', error: profilesError.message }));
    return { sent: 0, stale: 0 };
  }
  if (!profiles || profiles.length === 0) return { sent: 0, stale: 0 };

  // ── Which users are within ±90s of their local reminder time right now? ─────
  const dueUserIds: string[] = [];
  const localDateByUser = new Map<string, string>();
  const timezoneByUser = new Map<string, string>();

  for (const p of profiles as Array<{ id: string; timezone: string | null; body_reminder_time: string | null; body_reminder_sent_date: string | null; comfort_until: string | null; comfort_pauses_reminders: boolean | null }>) {
    if (!p.body_reminder_time) continue;
    if (isComfortMuted(p.comfort_until, now, p.comfort_pauses_reminders)) {
      console.log(JSON.stringify({ event: 'comfort_skip', reminder: 'body', user_id: p.id }));
      continue;
    }
    const tz = p.timezone ?? 'UTC';
    timezoneByUser.set(p.id, tz);

    let nowSecondsOfDay: number;
    let localDate: string;
    try {
      const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = timeFmt.formatToParts(now);
      const h = parseInt(parts.find((x) => x.type === 'hour')?.value ?? '0', 10);
      const m = parseInt(parts.find((x) => x.type === 'minute')?.value ?? '0', 10);
      const s = parseInt(parts.find((x) => x.type === 'second')?.value ?? '0', 10);
      nowSecondsOfDay = h * 3600 + m * 60 + s;
      localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    } catch {
      continue; // unknown timezone — skip rather than guess
    }

    localDateByUser.set(p.id, localDate);

    // Dedup guard: already sent today (see 20260813000002_body_reminder_sent_date.sql).
    if (p.body_reminder_sent_date === localDate) continue;

    const [rh, rm] = p.body_reminder_time.split(':').map(Number);
    const reminderSeconds = rh * 3600 + (rm ?? 0) * 60;
    if (Math.abs(nowSecondsOfDay - reminderSeconds) <= 90) {
      dueUserIds.push(p.id);
    }
  }

  if (dueUserIds.length === 0) return { sent: 0, stale: 0 };

  // ── Suppress if already logged today — never notify for something already done ──
  const { data: existingCheckins } = await supabase
    .from('body_checkins')
    .select('user_id, entry_date')
    .in('user_id', dueUserIds);

  const alreadyLogged = new Set<string>();
  for (const row of (existingCheckins ?? []) as Array<{ user_id: string; entry_date: string }>) {
    if (localDateByUser.get(row.user_id) === row.entry_date) alreadyLogged.add(row.user_id);
  }
  const notLoggedYet = dueUserIds.filter((id) => !alreadyLogged.has(id));
  if (notLoggedYet.length === 0) return { sent: 0, stale: 0 };

  // ── DND check, same helper and same convention as check-ins ─────────────────
  const { data: dndRows } = await supabase
    .from('check_in_settings')
    .select('user_id, dnd_start_time, dnd_end_time')
    .in('user_id', notLoggedYet)
    .eq('dnd_enabled', true);

  type DndRow = { user_id: string; dnd_start_time: string | null; dnd_end_time: string | null };
  const dndByUser = new Map<string, DndRow>();
  for (const row of (dndRows ?? []) as DndRow[]) dndByUser.set(row.user_id, row);

  const toNotify = notLoggedYet.filter((id) => {
    const dnd = dndByUser.get(id);
    if (dnd?.dnd_start_time && dnd?.dnd_end_time) {
      return !isInDndWindow(now, timezoneByUser.get(id) ?? 'UTC', dnd.dnd_start_time, dnd.dnd_end_time);
    }
    return true;
  });
  if (toNotify.length === 0) return { sent: 0, stale: 0 };

  // ── Send ──────────────────────────────────────────────────────────────────
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', toNotify);

  // Expo push tokens (additive, native support) — wrapped so a query failure
  // here never blocks web push delivery below.
  let expoTokenRows: Array<{ user_id: string; token: string }> = [];
  try {
    const { data, error } = await supabase.from('expo_push_tokens').select('user_id, token').in('user_id', toNotify);
    if (error) throw new Error(error.message);
    expoTokenRows = data ?? [];
  } catch (err) {
    console.error(JSON.stringify({ event: 'body_reminder_expo_tokens_query_failed', error: (err as Error).message }));
  }

  if ((!subscriptions || subscriptions.length === 0) && expoTokenRows.length === 0) return { sent: 0, stale: 0 };

  const subsByUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions ?? []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, []);
    subsByUser.get(sub.user_id)!.push(sub);
  }

  const expoByUser = new Map<string, string[]>();
  for (const row of expoTokenRows) {
    if (!expoByUser.has(row.user_id)) expoByUser.set(row.user_id, []);
    expoByUser.get(row.user_id)!.push(row.token);
  }

  const title = 'Symetric';
  const body = "Log today's body check-in.";
  const payload = JSON.stringify({ title, body });
  let sent = 0;
  const staleEndpoints: string[] = [];
  const staleExpoTokens: string[] = [];

  for (const userId of toNotify) {
    const subs = subsByUser.get(userId) ?? [];
    const expoTokens = expoByUser.get(userId) ?? [];
    if (subs.length === 0 && expoTokens.length === 0) continue;

    const outcomes = await Promise.all(
      subs.map(async (sub) => {
        try {
          const res = await sendWebPush(sub, payload, vapidPrivateKey, contactEmail);
          return { sub, res };
        } catch {
          return { sub, res: null as Response | null };
        }
      })
    );

    let delivered = false;
    for (const { sub, res } of outcomes) {
      if (!res) continue;
      if (res.ok || res.status === 201) {
        delivered = true;
      } else if (res.status === 410 || res.status === 404) {
        staleEndpoints.push(sub.endpoint);
      }
    }

    // Expo push (additive, native support) — wrapped so a batch failure can
    // never affect the web push outcome computed above.
    if (expoTokens.length > 0) {
      try {
        const expoResults = await sendExpoPushBatch(expoTokens.map((token) => ({ to: token, title, body })));
        for (const r of expoResults) {
          if (r.ok) delivered = true;
          else if (r.error === 'DeviceNotRegistered') staleExpoTokens.push(r.to);
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'body_reminder_expo_push_failed', user_id: userId, error: (err as Error).message }));
      }
    }

    if (delivered) {
      sent++;
      const localDate = localDateByUser.get(userId)!;
      const { error: stampError } = await supabase
        .from('profiles')
        .update({ body_reminder_sent_date: localDate })
        .eq('id', userId);
      if (stampError) {
        console.error(JSON.stringify({ event: 'body_reminder_stamp_failed', user_id: userId, error: stampError.message }));
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }
  if (staleExpoTokens.length > 0) {
    await supabase.from('expo_push_tokens').delete().in('token', staleExpoTokens);
  }

  const stale = staleEndpoints.length + staleExpoTokens.length;
  console.log(JSON.stringify({ event: 'body_reminder_batch_complete', sent, stale, due: toNotify.length }));
  return { sent, stale };
}

// ── Optional morning body check-in reminder ───────────────────────────────────
// Same shape as sendBodyReminders above, but gated on body_morning_enabled
// (opt-in, off by default) and keyed off body_morning_time /
// body_morning_reminder_sent_date instead of the evening columns. "Already
// logged" here means morning_logged_at is set on today's row specifically —
// a row can already exist from an evening entry without morning being done.
async function sendMorningBodyReminders(
  supabase: ReturnType<typeof createClient>,
  now: Date,
  vapidPrivateKey: string,
  contactEmail: string,
): Promise<{ sent: number; stale: number }> {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, timezone, body_morning_time, body_morning_reminder_sent_date, comfort_until, comfort_pauses_reminders')
    .eq('body_tracking_enabled', true)
    .eq('body_morning_enabled', true);

  if (profilesError) {
    console.error(JSON.stringify({ event: 'body_morning_profiles_query_failed', error: profilesError.message }));
    return { sent: 0, stale: 0 };
  }
  if (!profiles || profiles.length === 0) return { sent: 0, stale: 0 };

  const dueUserIds: string[] = [];
  const localDateByUser = new Map<string, string>();
  const timezoneByUser = new Map<string, string>();

  for (const p of profiles as Array<{ id: string; timezone: string | null; body_morning_time: string | null; body_morning_reminder_sent_date: string | null; comfort_until: string | null; comfort_pauses_reminders: boolean | null }>) {
    if (!p.body_morning_time) continue;
    if (isComfortMuted(p.comfort_until, now, p.comfort_pauses_reminders)) {
      console.log(JSON.stringify({ event: 'comfort_skip', reminder: 'body_morning', user_id: p.id }));
      continue;
    }
    const tz = p.timezone ?? 'UTC';
    timezoneByUser.set(p.id, tz);

    let nowSecondsOfDay: number;
    let localDate: string;
    try {
      const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = timeFmt.formatToParts(now);
      const h = parseInt(parts.find((x) => x.type === 'hour')?.value ?? '0', 10);
      const m = parseInt(parts.find((x) => x.type === 'minute')?.value ?? '0', 10);
      const s = parseInt(parts.find((x) => x.type === 'second')?.value ?? '0', 10);
      nowSecondsOfDay = h * 3600 + m * 60 + s;
      localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    } catch {
      continue;
    }

    localDateByUser.set(p.id, localDate);

    if (p.body_morning_reminder_sent_date === localDate) continue;

    const [rh, rm] = p.body_morning_time.split(':').map(Number);
    const reminderSeconds = rh * 3600 + (rm ?? 0) * 60;
    if (Math.abs(nowSecondsOfDay - reminderSeconds) <= 90) {
      dueUserIds.push(p.id);
    }
  }

  if (dueUserIds.length === 0) return { sent: 0, stale: 0 };

  // ── Suppress if morning is already logged today (not just any row) ──────────
  const { data: existingCheckins } = await supabase
    .from('body_checkins')
    .select('user_id, entry_date, morning_logged_at')
    .in('user_id', dueUserIds);

  const alreadyLogged = new Set<string>();
  for (const row of (existingCheckins ?? []) as Array<{ user_id: string; entry_date: string; morning_logged_at: string | null }>) {
    if (row.morning_logged_at && localDateByUser.get(row.user_id) === row.entry_date) alreadyLogged.add(row.user_id);
  }
  const notLoggedYet = dueUserIds.filter((id) => !alreadyLogged.has(id));
  if (notLoggedYet.length === 0) return { sent: 0, stale: 0 };

  // ── DND check, same helper and same convention as check-ins ─────────────────
  const { data: dndRows } = await supabase
    .from('check_in_settings')
    .select('user_id, dnd_start_time, dnd_end_time')
    .in('user_id', notLoggedYet)
    .eq('dnd_enabled', true);

  type DndRow = { user_id: string; dnd_start_time: string | null; dnd_end_time: string | null };
  const dndByUser = new Map<string, DndRow>();
  for (const row of (dndRows ?? []) as DndRow[]) dndByUser.set(row.user_id, row);

  const toNotify = notLoggedYet.filter((id) => {
    const dnd = dndByUser.get(id);
    if (dnd?.dnd_start_time && dnd?.dnd_end_time) {
      return !isInDndWindow(now, timezoneByUser.get(id) ?? 'UTC', dnd.dnd_start_time, dnd.dnd_end_time);
    }
    return true;
  });
  if (toNotify.length === 0) return { sent: 0, stale: 0 };

  // ── Send ──────────────────────────────────────────────────────────────────
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', toNotify);

  // Expo push tokens (additive, native support) — wrapped so a query failure
  // here never blocks web push delivery below.
  let expoTokenRows: Array<{ user_id: string; token: string }> = [];
  try {
    const { data, error } = await supabase.from('expo_push_tokens').select('user_id, token').in('user_id', toNotify);
    if (error) throw new Error(error.message);
    expoTokenRows = data ?? [];
  } catch (err) {
    console.error(JSON.stringify({ event: 'body_morning_reminder_expo_tokens_query_failed', error: (err as Error).message }));
  }

  if ((!subscriptions || subscriptions.length === 0) && expoTokenRows.length === 0) return { sent: 0, stale: 0 };

  const subsByUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions ?? []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, []);
    subsByUser.get(sub.user_id)!.push(sub);
  }

  const expoByUser = new Map<string, string[]>();
  for (const row of expoTokenRows) {
    if (!expoByUser.has(row.user_id)) expoByUser.set(row.user_id, []);
    expoByUser.get(row.user_id)!.push(row.token);
  }

  const title = 'Symetric';
  const body = "Log this morning's body check-in.";
  const payload = JSON.stringify({ title, body });
  let sent = 0;
  const staleEndpoints: string[] = [];
  const staleExpoTokens: string[] = [];

  for (const userId of toNotify) {
    const subs = subsByUser.get(userId) ?? [];
    const expoTokens = expoByUser.get(userId) ?? [];
    if (subs.length === 0 && expoTokens.length === 0) continue;

    const outcomes = await Promise.all(
      subs.map(async (sub) => {
        try {
          const res = await sendWebPush(sub, payload, vapidPrivateKey, contactEmail);
          return { sub, res };
        } catch {
          return { sub, res: null as Response | null };
        }
      })
    );

    let delivered = false;
    for (const { sub, res } of outcomes) {
      if (!res) continue;
      if (res.ok || res.status === 201) {
        delivered = true;
      } else if (res.status === 410 || res.status === 404) {
        staleEndpoints.push(sub.endpoint);
      }
    }

    // Expo push (additive, native support) — wrapped so a batch failure can
    // never affect the web push outcome computed above.
    if (expoTokens.length > 0) {
      try {
        const expoResults = await sendExpoPushBatch(expoTokens.map((token) => ({ to: token, title, body })));
        for (const r of expoResults) {
          if (r.ok) delivered = true;
          else if (r.error === 'DeviceNotRegistered') staleExpoTokens.push(r.to);
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'body_morning_reminder_expo_push_failed', user_id: userId, error: (err as Error).message }));
      }
    }

    if (delivered) {
      sent++;
      const localDate = localDateByUser.get(userId)!;
      const { error: stampError } = await supabase
        .from('profiles')
        .update({ body_morning_reminder_sent_date: localDate })
        .eq('id', userId);
      if (stampError) {
        console.error(JSON.stringify({ event: 'body_morning_reminder_stamp_failed', user_id: userId, error: stampError.message }));
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }
  if (staleExpoTokens.length > 0) {
    await supabase.from('expo_push_tokens').delete().in('token', staleExpoTokens);
  }

  const stale = staleEndpoints.length + staleExpoTokens.length;
  console.log(JSON.stringify({ event: 'body_morning_reminder_batch_complete', sent, stale, due: toNotify.length }));
  return { sent, stale };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const incomingToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!cronSecret || !incomingToken || incomingToken !== cronSecret) {
    console.error('[send-notifications] Unauthorized request rejected');
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const contactEmail = Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:hello@symetric.app';

  if (!vapidPrivateKey) {
    console.error('[send-notifications] VAPID_PRIVATE_KEY secret not set');
    return new Response(JSON.stringify({ error: 'VAPID_PRIVATE_KEY not configured' }), { status: 500 });
  }

  // Validate that we can extract x/y from the public key at startup, before doing
  // any DB work, so misconfiguration surfaces immediately in logs.
  try {
    vapidPublicKeyToJwkXY(VAPID_PUBLIC_KEY);
  } catch (err) {
    console.error('[send-notifications] VAPID_PUBLIC_KEY is malformed:', err);
    return new Response(JSON.stringify({ error: 'VAPID_PUBLIC_KEY malformed' }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Body tracking (alpha) reminder — independent of the check-in flow below,
  // so it runs on every tick regardless of whether any check-in is due. Wrapped
  // so a failure here can never affect check-in delivery.
  try {
    await sendBodyReminders(supabase, new Date(), vapidPrivateKey, contactEmail);
  } catch (err) {
    console.error(JSON.stringify({ event: 'body_reminder_failed', error: (err as Error).message }));
  }

  // Optional morning body check-in reminder — same independence/wrapping as above.
  try {
    await sendMorningBodyReminders(supabase, new Date(), vapidPrivateKey, contactEmail);
  } catch (err) {
    console.error(JSON.stringify({ event: 'body_morning_reminder_failed', error: (err as Error).message }));
  }

  // ── Query window ────────────────────────────────────────────────────────────
  // Look back 90 s to cover cron jitter (pg_cron can be 10–60 s late).
  // Look ahead 90 s so we notify slightly before the check-in rather than after.
  // Double-sends are prevented by the notified_at column: once a check-in is
  // stamped, subsequent cron runs skip it even if it's still in the window.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 90_000);
  const windowEnd   = new Date(now.getTime() + 90_000);

  console.log(`[send-notifications] scanning window ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

  // Only select pending check-ins that haven't been notified yet.
  const { data: dueCheckIns, error: ciError } = await supabase
    .from('check_ins')
    .select('id, user_id, scheduled_at')
    .eq('status', 'pending')
    .is('notified_at', null)
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString());

  if (ciError) {
    console.error('[send-notifications] check_ins query failed:', ciError);
    return new Response(JSON.stringify({ error: ciError.message }), { status: 500 });
  }

  if (!dueCheckIns || dueCheckIns.length === 0) {
    console.log('[send-notifications] no check-ins due');
    await runExpirySweep(supabase, now);
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  console.log(`[send-notifications] ${dueCheckIns.length} check-in(s) due`);

  // ── Fetch push subscriptions ────────────────────────────────────────────────
  // A user may have subscriptions from multiple browsers/devices — we send to
  // ALL of them so every device gets the notification.
  const userIds = [...new Set(dueCheckIns.map(ci => ci.user_id))];
  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (subError) {
    console.error('[send-notifications] push_subscriptions query failed:', subError);
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
  }

  // Expo push tokens (additive, native support) — wrapped so a query failure
  // here never blocks web push delivery below.
  let expoTokenRows: Array<{ user_id: string; token: string }> = [];
  try {
    const { data, error } = await supabase.from('expo_push_tokens').select('user_id, token').in('user_id', userIds);
    if (error) throw new Error(error.message);
    expoTokenRows = data ?? [];
  } catch (err) {
    console.error(JSON.stringify({ event: 'expo_tokens_query_failed', error: (err as Error).message }));
  }

  if ((!subscriptions || subscriptions.length === 0) && expoTokenRows.length === 0) {
    console.log('[send-notifications] no push subscriptions found for these users');
    await runExpirySweep(supabase, now);
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // ── Fetch DND settings and timezones ────────────────────────────────────────
  // Both queries run in parallel since they're independent.
  const [{ data: dndSettingsRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from('check_in_settings')
      .select('user_id, dnd_start_time, dnd_end_time')
      .in('user_id', userIds)
      .eq('dnd_enabled', true),
    supabase
      .from('profiles')
      .select('id, timezone, comfort_until, comfort_pauses_reminders')
      .in('id', userIds),
  ]);

  type DndRow = { user_id: string; dnd_start_time: string | null; dnd_end_time: string | null };
  const dndByUser = new Map<string, DndRow>();
  for (const row of dndSettingsRows ?? []) dndByUser.set(row.user_id, row as DndRow);

  const timezoneByUser = new Map<string, string>();
  const comfortUntilByUser = new Map<string, string | null>();
  const comfortPausesByUser = new Map<string, boolean>();
  for (const p of profileRows ?? []) {
    timezoneByUser.set(p.id, p.timezone ?? 'UTC');
    comfortUntilByUser.set(p.id, p.comfort_until ?? null);
    comfortPausesByUser.set(p.id, p.comfort_pauses_reminders ?? true);
  }

  // Group all subscriptions by user_id (one user may have multiple devices).
  const subsByUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions ?? []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, []);
    subsByUser.get(sub.user_id)!.push(sub);
  }

  const expoByUser = new Map<string, string[]>();
  for (const row of expoTokenRows) {
    if (!expoByUser.has(row.user_id)) expoByUser.set(row.user_id, []);
    expoByUser.get(row.user_id)!.push(row.token);
  }

  let sent = 0;
  const staleEndpoints: string[] = [];
  const staleExpoTokens: string[] = [];
  // Track which endpoints were 410'd per user so we can disable push_enabled
  // if a user ends up with zero valid subscriptions.
  const staleByUser = new Map<string, string[]>();
  // Expo tickets accepted during this run, checked against delivery receipts
  // once the loop is done — see the receipts block after it.
  const acceptedExpo: Array<{ checkInId: string; token: string; receiptId: string }> = [];
  const webDelivered = new Set<string>();

  for (const checkIn of dueCheckIns) {
    const subs = subsByUser.get(checkIn.user_id) ?? [];
    const expoTokens = expoByUser.get(checkIn.user_id) ?? [];
    if (subs.length === 0 && expoTokens.length === 0) {
      console.log(JSON.stringify({ event: 'no_subscription', check_in_id: checkIn.id, user_id: checkIn.user_id }));
      continue;
    }

    // ── Comfort mode check ───────────────────────────────────────────────────
    // The check-in row itself is untouched: it stays due, stays completable and
    // still expires on its own schedule. Only the nudge is withheld.
    if (isComfortMuted(comfortUntilByUser.get(checkIn.user_id), now, comfortPausesByUser.get(checkIn.user_id))) {
      console.log(JSON.stringify({ event: 'comfort_skip', reminder: 'mind', check_in_id: checkIn.id, user_id: checkIn.user_id }));
      continue;
    }

    // ── DND check ────────────────────────────────────────────────────────────
    const dnd = dndByUser.get(checkIn.user_id);
    if (dnd && dnd.dnd_start_time && dnd.dnd_end_time) {
      const tz = timezoneByUser.get(checkIn.user_id) ?? 'UTC';
      if (isInDndWindow(now, tz, dnd.dnd_start_time, dnd.dnd_end_time)) {
        console.log(JSON.stringify({ event: 'dnd_skip', check_in_id: checkIn.id, user_id: checkIn.user_id, timezone: tz }));
        continue;
      }
    }

    const payload = JSON.stringify({
      title: 'Symetric',
      body: 'Check-in ready.',
    });

    // Send to all subscriptions in parallel — one user may have multiple devices.
    // Each call is wrapped so it always resolves, never rejects, keeping sub
    // accessible regardless of whether sendWebPush threw or returned an error status.
    const attemptAt = new Date().toISOString();
    const sendOutcomes = await Promise.all(
      subs.map(async (sub) => {
        try {
          const res = await sendWebPush(sub, payload, vapidPrivateKey, contactEmail);
          return { sub, res, networkError: null as string | null };
        } catch (err) {
          return { sub, res: null as Response | null, networkError: (err as Error).message };
        }
      })
    );

    let checkInNotified = false;
    // Delivery tracking updates — flushed to DB after processing all outcomes.
    const deliveryUpdates: Array<{
      endpoint: string;
      last_delivery_attempt_at: string;
      last_delivery_error: string | null;
    }> = [];

    for (const { sub, res, networkError } of sendOutcomes) {
      const endpointPrefix = sub.endpoint.slice(0, 50) + '…';
      const endpointHost = new URL(sub.endpoint).host;

      if (networkError !== null) {
        // Network error — transient; do not stamp notified_at so the cron can retry.
        console.error(JSON.stringify({
          event: 'push_network_error',
          check_in_id: checkIn.id,
          endpoint_host: endpointHost,
          error: networkError,
        }));
        deliveryUpdates.push({
          endpoint: sub.endpoint,
          last_delivery_attempt_at: attemptAt,
          last_delivery_error: `network_error: ${networkError}`,
        });
        continue;
      }

      const status = res!.status;

      if (res!.ok || status === 201) {
        checkInNotified = true;
        webDelivered.add(checkIn.id);
        console.log(JSON.stringify({
          event: 'push_sent',
          check_in_id: checkIn.id,
          endpoint_host: endpointHost,
          status,
        }));
        deliveryUpdates.push({
          endpoint: sub.endpoint,
          last_delivery_attempt_at: attemptAt,
          last_delivery_error: null,
        });

      } else if (status === 410 || status === 404) {
        // Subscription is definitively gone — queue for deletion.
        console.log(JSON.stringify({
          event: 'push_subscription_gone',
          check_in_id: checkIn.id,
          endpoint_host: endpointHost,
          status,
        }));
        staleEndpoints.push(sub.endpoint);
        // Track per-user so we can disable push_enabled if this was the last subscription.
        if (!staleByUser.has(checkIn.user_id)) staleByUser.set(checkIn.user_id, []);
        staleByUser.get(checkIn.user_id)!.push(sub.endpoint);
        // No delivery update needed — the row is about to be deleted.

      } else if (status === 429) {
        // Rate limited — log but don't stamp notified_at; next cron run may succeed.
        const body = await res!.text().catch(() => '');
        console.error(JSON.stringify({
          event: 'push_rate_limited',
          check_in_id: checkIn.id,
          endpoint_host: endpointHost,
          status,
          response_preview: body.slice(0, 120),
        }));
        deliveryUpdates.push({
          endpoint: sub.endpoint,
          last_delivery_attempt_at: attemptAt,
          last_delivery_error: `429_rate_limited`,
        });

      } else {
        // Other server error — log with detail.
        const body = await res!.text().catch(() => '');
        console.error(JSON.stringify({
          event: 'push_failed',
          check_in_id: checkIn.id,
          endpoint_host: endpointHost,
          status,
          response_preview: body.slice(0, 200),
          endpoint_prefix: endpointPrefix,
        }));
        deliveryUpdates.push({
          endpoint: sub.endpoint,
          last_delivery_attempt_at: attemptAt,
          last_delivery_error: `${status}: ${body.slice(0, 200)}`,
        });
      }
    }

    // Flush delivery tracking updates in parallel (best-effort — don't block on errors).
    if (deliveryUpdates.length > 0) {
      await Promise.allSettled(
        deliveryUpdates.map(({ endpoint, last_delivery_attempt_at, last_delivery_error }) =>
          supabase
            .from('push_subscriptions')
            .update({ last_delivery_attempt_at, last_delivery_error })
            .eq('endpoint', endpoint)
        )
      );
    }

    // Expo push (additive, native support) — wrapped so a batch failure can
    // never affect the web push outcome computed above.
    if (expoTokens.length > 0) {
      try {
        const expoResults = await sendExpoPushBatch(
          expoTokens.map((token) => ({ to: token, title: 'Symetric', body: 'Check-in ready.' }))
        );
        for (const r of expoResults) {
          if (r.ok) {
            checkInNotified = true;
            if (r.receiptId) acceptedExpo.push({ checkInId: checkIn.id, token: r.to, receiptId: r.receiptId });
            console.log(JSON.stringify({ event: 'expo_push_sent', check_in_id: checkIn.id }));
          } else if (r.error === 'DeviceNotRegistered') {
            staleExpoTokens.push(r.to);
          } else {
            console.error(JSON.stringify({ event: 'expo_push_failed', check_in_id: checkIn.id, error: r.error }));
          }
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'expo_push_batch_failed', check_in_id: checkIn.id, error: (err as Error).message }));
      }
    }

    // Only stamp notified_at if at least one device confirmed receipt.
    // Not stamping on pure network errors lets the next cron run retry within
    // the ±90s window. Not stamping on 429 lets the next run retry if FCM
    // rate-limits clear. 410/404 cases queue the row for deletion; the check-in
    // stays unstamped and will age out of the query window naturally.
    if (checkInNotified) {
      const { error: updateError } = await supabase
        .from('check_ins')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', checkIn.id);
      if (updateError) {
        console.error(JSON.stringify({
          event: 'notified_at_stamp_failed',
          check_in_id: checkIn.id,
          error: updateError.message,
        }));
      }
      sent++;
    } else {
      console.log(JSON.stringify({
        event: 'push_all_failed_unstamped',
        check_in_id: checkIn.id,
        user_id: checkIn.user_id,
      }));
    }
  }

  // ── Clean up expired subscriptions ─────────────────────────────────────────
  if (staleEndpoints.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints);
    if (deleteError) {
      console.error(JSON.stringify({ event: 'stale_delete_failed', error: deleteError.message }));
    } else {
      console.log(JSON.stringify({ event: 'stale_deleted', count: staleEndpoints.length }));
    }

    // Log users who now have zero valid subscriptions. We intentionally do NOT
    // flip push_enabled = false here: the client's syncPushSubscription will
    // detect the missing DB row on next app open and force a fresh re-subscribe
    // automatically. Setting push_enabled = false server-side would suppress
    // that auto-recovery path (App.tsx guards syncPushSubscription behind the
    // push_enabled flag).
    for (const [userId, deletedEndpoints] of staleByUser) {
      const remaining = (subsByUser.get(userId) ?? []).filter(
        (s) => !deletedEndpoints.includes(s.endpoint)
      );
      if (remaining.length === 0) {
        console.log(JSON.stringify({ event: 'user_all_subscriptions_gone', user_id: userId }));
      }
    }
  }

  if (staleExpoTokens.length > 0) {
    const { error: deleteError } = await supabase
      .from('expo_push_tokens')
      .delete()
      .in('token', staleExpoTokens);
    if (deleteError) {
      console.error(JSON.stringify({ event: 'expo_stale_delete_failed', error: deleteError.message }));
    } else {
      console.log(JSON.stringify({ event: 'expo_stale_deleted', count: staleExpoTokens.length }));
    }
  }

  // ── Expo delivery receipts ─────────────────────────────────────────────────
  //
  // An Expo ticket means only that Expo accepted the message. Whether APNs or
  // FCM took it is in the receipt, and that is the ONLY place a credentials
  // problem ever appears: an app whose FCM key is missing, wrong or revoked
  // gets an accepted ticket for every message and delivers none of them. Until
  // this block existed, that state stamped notified_at on every check-in, so
  // the database reported a healthy notification pipeline while no one was
  // being reminded of anything — the exact failure supabase/CRON.md warns is
  // invisible from the cron side.
  //
  // Best-effort by design. Expo's docs recommend reading receipts 15 minutes
  // after sending and promise nothing sooner, so a check inside the same run
  // catches the failures that resolve immediately (InvalidCredentials,
  // MismatchSenderId, DeviceNotRegistered) and misses slower ones. A receipt
  // that is still pending is therefore treated as delivered, never as failed —
  // guessing the other way would unstamp reminders that did arrive. The
  // thorough version needs a deferred job; see CRON.md.
  if (acceptedExpo.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_CHECK_DELAY_MS));
    const receipts = await fetchExpoPushReceipts(acceptedExpo.map((a) => a.receiptId));
    const outcome = summariseReceiptOutcomes(acceptedExpo, receipts, webDelivered);

    for (const failure of outcome.errors) {
      console.error(JSON.stringify({
        event: 'expo_receipt_error',
        check_in_id: failure.checkInId,
        error: failure.error,
      }));
    }

    // Not one device's problem — every native push this app sends is failing.
    if (outcome.credentialErrors.length > 0) {
      console.error(JSON.stringify({
        event: 'expo_push_credentials_broken',
        errors: outcome.credentialErrors,
        affected_messages: acceptedExpo.length,
      }));
    }

    if (outcome.deadTokens.length > 0) {
      const { error: receiptDeleteError } = await supabase
        .from('expo_push_tokens').delete().in('token', outcome.deadTokens);
      if (receiptDeleteError) {
        console.error(JSON.stringify({ event: 'expo_receipt_delete_failed', error: receiptDeleteError.message }));
      } else {
        console.log(JSON.stringify({ event: 'expo_receipt_tokens_deleted', count: outcome.deadTokens.length }));
      }
    }

    // Undo the stamp only where nothing at all got through. This keeps this
    // file's own convention intact — notified_at IS NULL means the push never
    // landed — which is what the "missed notification" diagnostics count.
    if (outcome.undeliveredCheckIns.length > 0) {
      const { error: unstampError } = await supabase
        .from('check_ins').update({ notified_at: null })
        .in('id', outcome.undeliveredCheckIns).eq('status', 'pending');
      if (unstampError) {
        console.error(JSON.stringify({ event: 'notified_at_clear_failed', error: unstampError.message }));
      } else {
        sent = Math.max(0, sent - outcome.undeliveredCheckIns.length);
        console.log(JSON.stringify({ event: 'notified_at_cleared', count: outcome.undeliveredCheckIns.length }));
      }
    }
  }

  await runExpirySweep(supabase, now);

  const result = { sent, stale: staleEndpoints.length + staleExpoTokens.length, checked: dueCheckIns.length };
  console.log(JSON.stringify({ event: 'batch_complete', ...result }));
  return new Response(JSON.stringify(result), { status: 200 });
});
