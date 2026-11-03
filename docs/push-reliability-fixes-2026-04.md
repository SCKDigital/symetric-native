# Push Notification Reliability Fixes
**Date:** 2026-04  
**Branch:** main  
**Related:** `docs/push-diagnosis-2026-04.md`

---

## What changed

### 1. `pushsubscriptionchange` handler — `public/sw.js`

**The fix for root cause #1 (zero-notification tester).**

Chrome on Android routes Web Push through FCM. FCM tokens rotate silently — after browser updates, OS notification-channel changes, or long inactivity. When this happens Chrome fires `pushsubscriptionchange` on the service worker. Previously this event had no handler; the old endpoint stayed in `push_subscriptions` until `send-notifications` received a 410/404, deleted the row, and left the user with zero subscriptions and no recovery path.

The handler now:
1. Re-subscribes with the same options as the original subscription (falls back to the hardcoded VAPID key if `event.oldSubscription` is unavailable).
2. Posts `SUBSCRIPTION_CHANGED` to any open app windows; they upsert the new endpoint via the authenticated Supabase client.
3. If no windows are open, writes a `pending-resub` flag to the SW cache so the next app open triggers a sync automatically.

### 2. On-open subscription sync — `src/App.tsx` + `src/hooks/usePushNotifications.ts`

**The fix for root cause #2 (hit-and-miss tester).**

`syncPushSubscription(userId)` is a new export from `usePushNotifications.ts`. It:
- Reads the live subscription from `pushManager.getSubscription()`
- Checks if that exact endpoint exists in `push_subscriptions`
- Upserts it if not (handles rotation, row deletion after 410, or any other gap)
- Clears the SW's `pending-resub` flag once upserted

`App.tsx` calls this once per session on mount (guarded by `pushSyncRanRef`), runs when `user` and `profile.push_enabled` are available. It also listens for `SUBSCRIPTION_CHANGED` messages from the SW to handle same-session rotations immediately.

### 3. `notified_at` only stamped on confirmed delivery — `supabase/functions/send-notifications/index.ts`

**The fix for root cause #3 (intermittent missed check-ins).**

Previously `notified_at` was written unconditionally after all subscription attempts — including when every attempt threw a network error. A transient FCM outage would permanently eat a check-in.

Now `notified_at` is only written if `checkInNotified = true` (at least one device returned a 2xx). Network errors and 429s leave the check-in unstamped so the next cron run (≤2 min later) can retry within the ±90s window. 410/404 cases queue the subscription for deletion; the check-in ages out of the window naturally and the user sees the pending card on next app open.

### 4. Parallel sends with `Promise.allSettled` — `send-notifications`

Sends to all subscriptions for a user now run in parallel. Previously a slow FCM endpoint could block the entire batch for that user. Each call is wrapped to always resolve so a network exception on one subscription never prevents processing the others.

### 5. Structured logging — `send-notifications`

All `console.log` / `console.error` calls in the hot path now emit JSON objects with machine-readable fields:

```json
{ "event": "push_sent",               "check_in_id": "…", "endpoint_host": "fcm.googleapis.com", "status": 201 }
{ "event": "push_subscription_gone",  "check_in_id": "…", "endpoint_host": "fcm.googleapis.com", "status": 410 }
{ "event": "push_rate_limited",       "check_in_id": "…", "endpoint_host": "fcm.googleapis.com", "status": 429 }
{ "event": "push_network_error",      "check_in_id": "…", "endpoint_host": "fcm.googleapis.com", "error": "…" }
{ "event": "push_all_failed_unstamped","check_in_id": "…", "user_id": "…" }
{ "event": "batch_complete",          "sent": 4, "stale": 1, "checked": 5 }
```

These are queryable in Supabase → Edge Function Logs using the JSON filter.

### 6. Delivery tracking columns — migration `20260418000002`

`push_subscriptions` gains three new columns:

| Column | Type | Purpose |
|---|---|---|
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Auto-updated on every write; shows when the subscription was last verified alive |
| `last_delivery_attempt_at` | `timestamptz` | Timestamp of the most recent send attempt |
| `last_delivery_error` | `text` | Error string from the last failed attempt, null on success |

`send-notifications` writes these after every push attempt.

### 7. Dev-only diagnostics panel — `src/components/settings/SettingsScreen.tsx`

A new `PushDiagnosticsPanel` component renders in the Notifications section in development builds only (`import.meta.env.DEV`). It shows:
- Whether a DB subscription row exists
- Whether the browser's `pushManager` has an active subscription
- Whether the two endpoints match (mismatch = rotation without sync)
- VAPID public key prefix
- `last_delivery_attempt_at` and `last_delivery_error` from the DB
- "Send test notification" button with round-trip outcome
- "Refresh" to re-query without reloading

Completely stripped from production — no runtime overhead.

---

## How to verify on an Android device

### Setup
1. Run `supabase db push` (or apply migration manually in SQL editor) to add the new columns.
2. Deploy the updated edge function: `supabase functions deploy send-notifications`.
3. Build and deploy the PWA front-end.

### Smoke test — normal delivery
1. Open the app. Settings → Notifications → enable Push notifications.
2. Wait for the next scheduled check-in (or use the SQL editor to set a check-in's `scheduled_at` to ~1 minute from now).
3. Confirm notification arrives. In Supabase Logs → Edge Functions → `send-notifications`, confirm a `push_sent` JSON log line.
4. Confirm `last_delivery_attempt_at` is populated and `last_delivery_error` is null (visible in the dev diagnostics panel or via SQL).

### Smoke test — subscription sync on open
1. In the Supabase SQL editor, delete the row from `push_subscriptions` for your test user.
2. Open the app. `syncPushSubscription` runs within ~2 seconds of the profile loading.
3. Confirm the row reappears in `push_subscriptions`.
4. Wait for a check-in notification — confirm it arrives.

### Smoke test — `pushsubscriptionchange` recovery
This is hard to trigger artificially. The closest approach on Android:
1. Enable notifications in the app.
2. In Chrome DevTools (remote debug from desktop), open the Application tab → Service Workers → click "Push" to fake a `pushsubscriptionchange` event. (Note: Chrome DevTools simulates the event but does not actually create a new subscription; the handler will run but `pushManager.subscribe()` will return the existing subscription, which is fine — the sync will confirm it's already in the DB.)
3. Real rotation can be tested by clearing Chrome's app data and re-opening — this forces a new FCM token and fires `pushsubscriptionchange`.

### Verify the diagnostics panel
1. Run the app locally (`npm run dev`).
2. Go to Settings → Notifications → scroll past the Notification sound toggle.
3. The purple "Dev — Push diagnostics" section should appear.
4. Verify all fields populate correctly and "Send test notification" triggers a real push.

---

## Rollback notes

- The migration adds columns; it is non-destructive and safe to roll forward even if the function deploy fails. Old function code ignores the new columns.
- The SW change (`pushsubscriptionchange`) is safe on browsers that do not support the event — it's simply never fired.
- `syncPushSubscription` is additive — it only writes to the DB if the endpoint is genuinely missing.
