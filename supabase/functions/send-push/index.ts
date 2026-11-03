/**
 * send-push — Web Push only, deliberately.
 *
 * Called by the pg_cron job confusingly named `send-checkin-notifications`
 * (see supabase/CRON.md — the two notification jobs are named the opposite way
 * round from the functions they call). It is a backstop behind
 * send-notifications, which is the function that actually reminds people about
 * check-ins on both channels.
 *
 * It has no Expo branch, so it delivers nothing to the native app — which is
 * now the only app. Do not "fix" that by dropping sendExpoPushBatch in here
 * without solving this first: this function is handed { user_id, title, body }
 * with no check-in id, so it cannot stamp check_ins.notified_at the way
 * send-notifications does. Anything it sends, it would send again on the next
 * run, every five minutes, until the two-hour expiry sweep caught the row —
 * a missed reminder would become twenty-four of them.
 *
 * If native ever needs this backstop, the job's SQL has to pass the check-in
 * id and this function has to stamp it.
 */

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!cronSecret || !incomingToken || incomingToken !== cronSecret) {
    console.error("[send-push] Unauthorized request rejected");
    return new Response("Unauthorized", { status: 401 });
  }

  const { user_id, title, body } = await req.json();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (error || !subs?.length) {
    return new Response(JSON.stringify({ error: "No subscription found" }), { status: 404 });
  }

  const payload = JSON.stringify({ title, body });

  await Promise.all(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});