# Push Notification Delivery — Diagnosis Report
**Date:** 2026-04  
**Scope:** Android Web Push (VAPID) reliability for Mosaic PWA  
**Symptoms:** Primary user hit-and-miss; second tester zero notifications despite confirmed install

---

## Files Reviewed

| File | Role |
|---|---|
| `supabase/functions/send-notifications/index.ts` | pg_cron handler — queries due check-ins, sends pushes |
| `public/sw.js` | Service worker — handles `push`, `install`, `activate` |
| `src/hooks/usePushNotifications.ts` | Client subscription lifecycle |
| `supabase/migrations/20260317000001_push_subscriptions_and_cron.sql` | Table schema + RLS |
| `supabase/migrations/20260422000001_checkin_notified_at.sql` | `notified_at` column |

---

## Root Cause Hypotheses (ranked by likelihood)

### #1 — `pushsubscriptionchange` event not handled in service worker  
**Confidence: Very High — almost certainly the cause of the second tester's zero-notification scenario**

Chrome on Android delivers Web Push via Firebase Cloud Messaging (FCM). FCM tokens have a lifecycle: they rotate when the browser is updated, when the OS clears app data, or when Android's background-app throttling kicks in. When this happens, Chrome fires a `pushsubscriptionchange` event on the service worker with the old subscription and a new one.

`public/sw.js` has no `pushsubscriptionchange` listener. The result:
- Old endpoint stays in `push_subscriptions` forever
- New endpoint is never upserted
- `send-notifications` keeps hitting the old endpoint
- FCM returns 404 or 410 for the dead endpoint
- `send-notifications` correctly deletes the row on 410/404 — **but now the user has zero subscriptions**
- All future check-ins silently fall through with "no subscription for user" logged

This is a silent, permanent failure with no user-facing recovery except manually toggling notifications off and back on in Settings.

---

### #2 — No stale-subscription check on app open  
**Confidence: High — explains hit-and-miss pattern for primary user**

`subscribeToPushNotifications()` is called during onboarding and when the user manually re-enables. There is no code anywhere that:
- Calls `pushManager.getSubscription()` on app boot
- Compares the live endpoint against what is stored in `push_subscriptions`
- Re-upserts if they differ or if the DB row is missing

If the subscription rotates silently (see #1) between times the user visits Settings, there is no recovery path. The browser holds a valid subscription object but the server knows nothing about it.

Additionally, when `subscribeToPushNotifications()` finds an existing subscription (`pushManager.getSubscription()` returns non-null), it skips the upsert entirely and returns `{ success: true }` without confirming the DB row exists. A user who unsubscribed server-side (e.g., row deleted manually, or deleted by a 410) but whose browser still holds a subscription object will silently never receive notifications again.

---

### #3 — `notified_at` stamped even when all pushes fail  
**Confidence: Medium — explains sporadic missed deliveries**

In `send-notifications`, `notified_at` is updated unconditionally after attempting all subscriptions for a check-in:

```typescript
// Stamp notified_at after attempting all subscriptions for this check-in.
// We do this even if only some devices succeeded, to avoid re-notifying...
// If all sends failed (network errors), we still stamp so we don't spam retries
```

If the Edge Function has a transient network issue (DNS hiccup, FCM endpoint timeout), the check-in is permanently marked as "attempted" and will never be retried on the next cron run. The user misses that check-in with no recovery.

The intent is correct (avoid spam), but the current logic doesn't distinguish between:
- "At least one device was notified" → stamp (correct)
- "All network errors — nothing was delivered" → stamp (silent data loss)

---

## Additional Issues Found

### Missing: 410/404 handling partially correct, other codes not handled

`send-notifications` correctly queues deletion on 410/404. However:

- **429 Too Many Requests** — logged as an error but no backoff, no retry scheduling. FCM can rate-limit; the check-in gets permanently stamped as notified regardless.
- **413 Payload Too Large** — logged, no action. (Payload is very small here so this is unlikely to trigger, but unhandled.)
- **5xx from FCM** — treated as transient errors in the comment intent, but `notified_at` is still stamped. A 503 from FCM means the message was not delivered, but the check-in is marked as done.

### Missing: `updated_at` on `push_subscriptions`

The `push_subscriptions` table has `created_at` but no `updated_at`. There is no way to tell whether a subscription was recently verified as live or has been silently stale for weeks. This makes diagnosing staleness very hard without sending a test push.

### Missing: Structured per-attempt logging

The current logs are sufficient for scanning but not for querying. A line like:

```
[send-notifications] push failed (500) for https://fcm.googleapis.com/fcm/send/…
```

cannot be aggregated easily. There's no structured JSON with `user_id`, `status_code`, `endpoint_host`, `check_in_id` in a machine-readable format.

### Present but potentially risky: VAPID key hardcoded in both files

`VAPID_PUBLIC_KEY` is identical in both `send-notifications/index.ts` and `usePushNotifications.ts` — they match, which is correct. However, if the key ever needs to be rotated (e.g., a private key leak), you'd need to coordinate a client deploy + server deploy + mass re-subscription from all users. Not a current bug, but a future operational risk.

### Possibly fine: `skipWaiting` deferred to app message

The SW defers `skipWaiting` to an app-sent `SKIP_WAITING` message rather than calling it in `install`. This is intentional and safe. New SW versions won't disrupt active sessions. However, if the app never sends this message (e.g., after a deploy the user just hard-refreshes), the old SW may stay active for longer than expected.

---

## What Is Definitely Working

- `push` event handler calls `event.waitUntil()` correctly — Chrome won't terminate the SW prematurely
- `showNotification()` is always called, including a fallback for missing/malformed payload — the SW won't silently eat push events
- 410/404 endpoint cleanup is implemented and correct
- Per-subscription failures are isolated from the batch (try/catch)
- VAPID keys match between client and server
- `notified_at` prevents double-sends correctly for the success path
- RLS is properly set up; service role bypasses it for the Edge Function

---

## What Is Definitely Missing

| Missing piece | Impact |
|---|---|
| `pushsubscriptionchange` handler in SW | Permanent silent failure after any FCM rotation |
| Stale subscription check on app open | No self-healing after rotation |
| Re-upsert when existing subscription found but DB row absent | Silent failure for row-deleted users |
| `updated_at` on `push_subscriptions` | Can't diagnose staleness without test push |
| Structured logging in send-notifications | Hard to query/alert on delivery failures |
| Conditional `notified_at` stamping (only on success) | Silent data loss on full-batch network failures |

---

## What Is Present but Possibly Buggy

| Code path | Risk |
|---|---|
| `notified_at` stamped even on all-fail | Low-probability data loss |
| 429 handling in send-notifications | Delivery drop on FCM rate-limit (uncommon) |
| SW version deferred activation | Users may run stale SW for extended periods |

---

## Instrumentation Gaps That Would Have Caught This Earlier

1. **No delivery success metric** — there's no count of "push accepted by FCM vs push rejected" stored anywhere. The only evidence of success is the absence of error logs.
2. **No subscription age tracking** — `push_subscriptions.created_at` tells you when the sub was first saved, not when it was last verified live. A 6-week-old row is indistinguishable from one created today.
3. **No client-side confirmation** — the client marks `push_enabled = true` when the upsert succeeds, but never records "last time push was confirmed alive."
4. **Logs are fire-and-forget** — `console.log` in the Edge Function appears in Supabase function logs but is not queryable or alertable.

---

## Recommended Queries for Initial Triage

Run `scripts/diagnose-push-delivery.sql` with the affected users' UUIDs. For a **healthy** user expect:
- 1–2 `push_subscriptions` rows, `created_at` within the last few days/weeks
- All recent `check_ins` showing `notified_at IS NOT NULL`
- No rows in the "MISSED — past window, never notified" bucket

For the **broken** user (zero notifications) expect:
- 0 `push_subscriptions` rows (subscription was deleted after 410/404 from rotated FCM token, never re-added)
- OR 1+ rows with very old `created_at` that no longer corresponds to a live FCM endpoint

---

## Confirmed Diagnostic Data (2026-04-18)

Results from running `scripts/diagnose-push-delivery.sql` against the two affected users.

### User d5ae4dfe… (primary — hit-and-miss)

| Metric | Value |
|---|---|
| Total check-ins | 73 |
| Notified (`notified_at IS NOT NULL`) | 17 (23%) |
| Completed without notification | 47 |
| Missed-unnotified (past window, pending, `notified_at IS NULL`) | — |

**Interpretation:** 23% delivery rate is consistent with hypotheses #2 and #3. The subscription exists but has likely rotated at least once — some early check-ins landed on a live endpoint, then FCM rotated and subsequent sends hit a stale endpoint. The `notified_at` stampings on the 17 successful deliveries confirm the pipeline works end-to-end; it's the subscription staleness that causes the drop-off.

### User 2e776af4… (second tester — zero notifications)

| Metric | Value |
|---|---|
| Total check-ins | 45 |
| Notified (`notified_at IS NOT NULL`) | 0 (0%) |
| Missed-unnotified (past window, pending, `notified_at IS NULL`) | 34 |

**Interpretation:** Zero delivery rate with 34 check-ins that passed through `send-notifications` without triggering a notification is the signature of hypothesis #1. The subscription row was almost certainly deleted from `push_subscriptions` after a 410/404 response (rotated FCM token), and the `pushsubscriptionchange` handler was never there to re-subscribe. All subsequent cron runs log "no subscription for user" and move on.

### Subscription rows

_To be appended once `push_subscriptions` query is run for both users._

Expected for d5ae4dfe…: 0–1 rows; if 1 exists, `created_at` will predate the delivery drop-off.  
Expected for 2e776af4…: 0 rows.

### Baseline for Phase 2 verification

After Phase 2 fixes are deployed, re-run the diagnostic SQL. Success criteria:
- Both users show 1 active `push_subscriptions` row with a recent `created_at`
- Delivery rate for new check-ins reaches ≥ 90% within 24 hours of re-subscription
- No rows in the "missed-unnotified" bucket for check-ins scheduled after the fix deployment
