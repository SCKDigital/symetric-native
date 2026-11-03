# Phase 2 Push Reliability — Self-Audit Report
**Date:** 2026-04  
**Auditor:** Claude (self-audit against own Phase 2 changes)  
**Status:** Two real bugs found, one missing feature, two minor gaps

---

## Files audited (read in full)

- `public/sw.js` — 191 lines
- `src/hooks/usePushNotifications.ts` — 243 lines
- `supabase/functions/send-notifications/index.ts` — 474 lines

---

## A. pushsubscriptionchange handler — `public/sw.js`

### A1. Null `event.oldSubscription` handling

**Verdict: PASS for re-subscribe. FLAG for old-row cleanup.**

Lines 104–106 guard against null `oldSubscription` before using `.options`:

```javascript
const subscribeOptions = (event.oldSubscription && event.oldSubscription.options)
  ? event.oldSubscription.options
  : { userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY_B64) };
```

If `event.oldSubscription` is null, the fallback fires and `subscribe()` still succeeds using the hardcoded VAPID key. ✅

However, line 111 sets `oldEndpoint = null`:

```javascript
const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : null;
```

When `oldEndpoint` is null, **no cleanup of the old DB row is possible**. The row accumulates until `send-notifications` tries to deliver to it and receives 410/404. This is handled by the existing stale-endpoint deletion logic, so delivery is not permanently broken — but there is a gap between rotation and cleanup. See A3 for the wider version of this issue.

---

### A2. Fallback when `event.oldSubscription.options.applicationServerKey` is missing

**Verdict: EDGE CASE — low risk but not fully guarded.**

The fallback to the hardcoded VAPID key only triggers when `event.oldSubscription` is null or falsy (line 104 guard). If `event.oldSubscription` is non-null and `event.oldSubscription.options` is non-null, those options are used verbatim — even if `applicationServerKey` is null or absent inside them (e.g., an old pre-VAPID subscription). In that scenario, `subscribe()` would attempt a non-VAPID subscription and either fail or produce an unauthenticated endpoint that `send-notifications` can't use (JWT would be required by FCM regardless).

In practice, all existing Mosaic subscriptions are created with a VAPID key (lines 74–78 of `usePushNotifications.ts`), so this is not an active risk. Worth noting as a theoretical edge case.

---

### A3. What deletes the old `push_subscriptions` row after rotation?

**Verdict: BUG — old rows are never proactively deleted.**

The code uses **approach (c): nothing — stale rows accumulate until `send-notifications` cleans them up.**

The Phase 2 spec explicitly said "Delete the old row by endpoint." That does not happen. Walking through the full flow:

1. SW fires `pushsubscriptionchange`, re-subscribes, gets `newSubscription`
2. SW posts `{ type: 'SUBSCRIPTION_CHANGED', oldEndpoint }` to clients (line 116–118)
3. App.tsx receives the message and calls `syncPushSubscription(userId)` (App.tsx ~line 191)
4. `syncPushSubscription` upserts the **new** endpoint — it never reads or uses `oldEndpoint`
5. The old row remains in `push_subscriptions`

On the next cron run, `send-notifications` will attempt to deliver to the old endpoint, receive 410/404, and queue it for deletion (lines 372–381). So cleanup does happen eventually — within ≤2 minutes. Delivery is not permanently blocked because the new endpoint is upserted.

However, the spec asked for explicit deletion using `oldEndpoint`, which is available in the message data but completely ignored by the client handler. This is a real gap.

---

### A4. Open-clients path, pending-resub flag storage and read

**Open-clients path:**

SW posts (lines 116–119):
```javascript
clientsList.forEach(client => client.postMessage({
  type: 'SUBSCRIPTION_CHANGED',
  oldEndpoint,
}));
```

App.tsx listens (App.tsx ~lines 185–193):
```javascript
navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'SUBSCRIPTION_CHANGED') {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) syncPushSubscription(u.id);
    });
  }
});
```

`oldEndpoint` in the message is **not used**. Only `syncPushSubscription(userId)` is called.

**Pending-resub flag:**

- **Stored in:** SW Cache API, under key `/sw-pending-resub` inside the `CACHE_NAME` (`mosaic-v8`) cache (sw.js lines 123–130)
- **Data stored:** `{ pendingAt: Date.now(), oldEndpoint }` — JSON

**Where the flag is READ:**  
**Verdict: FLAG — the flag is never read to trigger behaviour; it is only deleted.**

`syncPushSubscription` (lines 208–215) contains:
```typescript
try {
  const cache = await caches.open('mosaic-v8');
  await cache.delete('/sw-pending-resub');
  debug.log('Push', 'syncPushSubscription — cleared pending-resub flag');
} catch {
  // Cache access is best-effort.
}
```

This block runs unconditionally after a successful upsert — it deletes the flag but does not read it to decide whether to sync or to retrieve `oldEndpoint`. The sync is triggered by the `pushSyncRanRef` `useEffect` in App.tsx which runs on every cold start regardless of whether the flag exists:

```typescript
// App.tsx
useEffect(() => {
  if (!user || !profile?.push_enabled || pushSyncRanRef.current) return;
  pushSyncRanRef.current = true;
  syncPushSubscription(user.id);
}, [user?.id, profile?.push_enabled]);
```

**The pending-resub flag is functionally inert for triggering behaviour.** The sync would run on the next app open whether or not the flag exists. The flag is cleaned up as a courtesy but provides no signal. The docstring on `syncPushSubscription` says "Also checks for a pending-resub flag" — this is misleading; it only clears it. The `oldEndpoint` stored in the flag data is also never extracted and used for deletion.

---

### A5. Handler throws on re-subscribe failure

**Verdict: PASS.**

The entire handler body is wrapped in try/catch (lines 100–136):

```javascript
event.waitUntil((async () => {
  try {
    // ... all logic including subscribe() call
  } catch (err) {
    console.error('[SW] pushsubscriptionchange — resubscription failed:', err);
  }
})());
```

If `pushManager.subscribe()` throws (permission revoked, network error, VAPID mismatch), the error is caught and logged. The async IIFE resolves (not rejects) with `undefined`. `event.waitUntil()` receives a resolved promise. The SW is not terminated. ✅

---

## B. syncPushSubscription — `src/hooks/usePushNotifications.ts`

### B1. Does sync check DB and upsert even when `getSubscription()` returns non-null?

**Verdict: PASS.**

Lines 157–179: the subscription object from `pushManager.getSubscription()` is obtained, and if non-null, the DB is queried immediately with no early return:

```typescript
const subscription = await registration.pushManager.getSubscription();

if (!subscription) {
  debug.log('Push', 'syncPushSubscription — no active subscription in browser');
  return;       // only early-return: subscription IS null
}

// Always reaches here if subscription is non-null:
const { data: existing, error: selectError } = await supabase
  .from('push_subscriptions')
  .select('endpoint')
  .eq('endpoint', subscription.endpoint)
  .maybeSingle();
```

The Phase 1 concern about the original `subscribeToPushNotifications` (which also correctly upserted, on re-reading) does not apply here. `syncPushSubscription` never skips the DB check. ✅

---

### B2. Does it compare the current endpoint, not just "any row exists"?

**Verdict: PASS.**

Line 168: `.eq('endpoint', subscription.endpoint)` — the query filters by the exact endpoint value of the current browser subscription, not by `user_id`. If the DB has an old endpoint for this user but not the current one, `existing` is null and the new endpoint is upserted. ✅

RLS is satisfied because the Supabase client is authenticated and the policy is `auth.uid() = user_id`; the user can only match their own rows.

---

### B3. Trigger points for `syncPushSubscription`

**Three trigger points:**

1. **Cold-start mount (App.tsx ~lines 232–237):**
   ```typescript
   useEffect(() => {
     if (!user || !profile?.push_enabled || pushSyncRanRef.current) return;
     pushSyncRanRef.current = true;
     syncPushSubscription(user.id);
   }, [user?.id, profile?.push_enabled]);
   ```
   Fires once per React session after `user` and `profile.push_enabled` are available. `pushSyncRanRef` prevents it from repeating within the same session. This is **cold start only**, not every foreground event. A user who backgrounds and foregrounds the app without a full close/reopen will not retrigger sync during that session.

2. **SW `SUBSCRIPTION_CHANGED` message (App.tsx ~lines 185–193):**
   ```typescript
   if (event.data?.type === 'SUBSCRIPTION_CHANGED') {
     supabase.auth.getUser().then(({ data: { user: u } }) => {
       if (u) syncPushSubscription(u.id);
     });
   }
   ```
   Fires when the SW posts this message, which only happens when `pushsubscriptionchange` fires **and** app windows are open. This trigger bypasses `pushSyncRanRef`.

3. **Implicit via pending-resub flag:** As noted in A4, there is no third trigger path. The flag is cleaned up but not read. Sync on the next cold start handles this case.

**Coverage gap:** A user who has the app open in the background for an extended period (days) and whose FCM token rotates while backgrounded will get the SUBSCRIPTION_CHANGED message if any window is open, OR will be re-synced on the next cold start. No sync occurs on background→foreground transitions within a single session.

---

### B4. Failure handling

**Verdict: PASS.**

`syncPushSubscription` has three failure paths, all caught:

1. DB select error: `debug.error(...)` then `return` (lines 171–174) — no propagation
2. Key extraction failure: `debug.error(...)` then `return` (lines 186–189) — no propagation
3. Upsert error: `debug.error(...)` then `return` (lines 201–204) — no propagation
4. Any unexpected throw: caught by outer try/catch (lines 155, 216–218), `debug.error` only

None of these propagate to React. ✅

---

### B5. Does sync run before `profile.push_enabled` is known?

**Verdict: PASS for cold-start path. MINOR NOTE for SUBSCRIPTION_CHANGED path.**

The cold-start `useEffect` guards explicitly: `if (!user || !profile?.push_enabled || ...)`. If `profile` is null or `push_enabled` is false, sync does not run.

The SUBSCRIPTION_CHANGED message path does not check `push_enabled`. It calls `supabase.auth.getUser()` and if a user is present, calls `syncPushSubscription`. The function itself is safe to run on users with push disabled — it calls `pushManager.getSubscription()`, finds either null (if they disabled push) or a subscription, checks the DB, and upserts only if needed. No harmful side effect. Acceptable but worth noting.

---

### B6. Does it read the pending-resub flag?

**Verdict: FLAG — misleading docstring, flag is not read.**

As detailed in A4: the flag is deleted (lines 209–214) after a successful upsert, but it is never read to decide whether to sync or to retrieve `oldEndpoint`. The sync runs unconditionally on cold start. The comment in the docstring "Also checks for a pending-resub flag" is inaccurate — "clears" would be correct.

---

## C. `notified_at` and retry logic — `send-notifications/index.ts`

### C1. Exact condition for stamping `notified_at`

**Verdict: PASS.**

`checkInNotified` is declared `false` (line 328) and set `true` only at line 359:
```typescript
if (res!.ok || status === 201) {
  checkInNotified = true;
```

`notified_at` is stamped only at lines 435–447:
```typescript
if (checkInNotified) {
  const { error: updateError } = await supabase
    .from('check_ins')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', checkIn.id);
  ...
  sent++;
}
```

Tracing every non-2xx path confirms `checkInNotified` is never set to `true`:
- Network error (lines 340–354): `continue` — checkInNotified stays false ✅
- 410/404 (lines 372–381): row pushed to staleEndpoints, no checkInNotified update ✅
- 429 (lines 383–397): delivery update written, no checkInNotified update ✅
- Other 4xx/5xx (lines 399–415): delivery update written, no checkInNotified update ✅

✅

---

### C2. Retry ceiling / expiry stamping

**Verdict: MISSING FEATURE — but no infinite retry risk in practice.**

The Phase 2 spec asked: "if a check-in is >2 hours past `scheduled_at` and still un-notified, stamp it anyway with a flag or status indicating `expired_before_delivery`." **This does not exist in the code.**

However, an infinite retry loop does not occur because the query window is fixed: `scheduled_at BETWEEN (now - 90s) AND (now + 90s)`. A check-in with `scheduled_at` more than 90 seconds in the past will never be selected again by subsequent cron runs. The maximum number of retry attempts for a single check-in within its query window is ~2 (one at T-90s, one at T+0, one at T+90s — i.e., roughly 3 cron runs at 2-minute intervals).

**Consequence:** Check-ins for users with only failing subscriptions (not 410/404) stay in state `status='pending', notified_at=null` indefinitely. They do not age to a terminal state. The user will see stale "pending" cards on app open until the check-in expires normally via the app's own expiry logic (if any). This is a UI concern, not a delivery loop.

**Flag:** The expiry-stamping feature was in scope and is missing. Whether to add it is your call.

---

### C3. `Promise.all` vs `Promise.allSettled` — isolation guarantee

**Verdict: PASS — `Promise.all` is used but correctly wrapped to never reject.**

Line 317:
```typescript
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
```

Each inner async function has its own try/catch. If `sendWebPush` throws, the catch returns a settled object with `networkError` set. The inner function never rejects — it always resolves with a value. Therefore `Promise.all` on this array can never reject. A failure on one subscription does not prevent the others from completing or their results from being processed. ✅

If one subscription's inner function somehow threw outside the try/catch (not possible in this code, but hypothetically), `Promise.all` would reject and `checkInNotified` would be false, so `notified_at` would not be stamped. The for-loop processing the outcomes would be skipped. Delivery tracking updates for that check-in would be lost. In practice this path is unreachable.

**Justification for `Promise.all` over `Promise.allSettled`:** Because every item always resolves, the two are functionally identical. The wrapping approach preserves direct access to `sub` on the rejection path, which is the primary advantage over `Promise.allSettled` (where rejected items don't carry the `sub` reference). Correct choice.

---

### C4. Per-outcome behaviour table

| Outcome | `notified_at` | `push_subscriptions` row | `last_delivery_attempt_at` | `last_delivery_error` |
|---|---|---|---|---|
| **2xx / 201** | **Stamped** | Updated (attempt + null error) | Set to `attemptAt` | `null` |
| **410 / 404** | Not stamped | **Deleted** (end of batch) | Not updated (row deleted) | Not updated (row deleted) |
| **429** | Not stamped | Updated | Set to `attemptAt` | `"429_rate_limited"` |
| **5xx / other** | Not stamped | Updated | Set to `attemptAt` | `"${status}: ${body[:200]}"` |
| **Network error** | Not stamped | Updated | Set to `attemptAt` | `"network_error: ${msg}"` |

One nuance on 410/404: the row is deleted at the end of the batch (lines 458–466), not immediately when the 410 is received. If multiple check-ins are due simultaneously for the same user and the same subscription returns 410 for each, `staleEndpoints` accumulates duplicates. The `.in('endpoint', staleEndpoints)` delete is idempotent on SQL level (deleting already-deleted rows is a no-op), so no correctness issue. But it's worth noting that `staleEndpoints` can hold the same endpoint multiple times.

---

## D. Diagnostics panel — `PushDiagnosticsPanel`

### D1. Both endpoints shown side-by-side?

**Verdict: PARTIAL — browser endpoint shown as string, DB endpoint not shown as string.**

The panel shows:
- `"DB subscription row: Present / Missing"` — boolean
- `"Browser subscription: Present / None"` — boolean  
- `"Endpoint match (browser ↔ DB): Match / MISMATCH"` — derived boolean
- `"Browser endpoint:"` — first 80 characters of the live endpoint

The **DB endpoint is never shown as a string.** If there is a mismatch, you can see the browser endpoint but not the DB endpoint, making it harder to diagnose which one is stale. The audit question specifically calls this out: "A boolean 'endpoints match: true' is less useful for debugging."

To fix: add the DB endpoint prefix (first 60–80 chars) to the "DB subscription row: Present" display line.

---

### D2. Test notification button — end-to-end flow

1. `handleTestNotification()` calls `supabase.functions.invoke('send-test-notification')`
2. `send-test-notification` edge function: authenticates caller via JWT, fetches the user's `push_subscriptions` row (`.maybeSingle()`), calls `sendWebPush`, returns `{ sent: true }` on 2xx or error codes on failure
3. If no error: `setTestState('ok')`; if error includes `no_subscription`: specific message; else generic fail message
4. After 1.5s, `load()` is called to refresh `last_delivery_attempt_at` from DB

One note: `send-test-notification` uses `.maybeSingle()` which picks the first row if the user has multiple subscriptions (the one with the lowest sort order — Postgres-defined). It does not necessarily target the current device's subscription. This is pre-existing behaviour, not introduced by Phase 2.

---

### D3. DEV gate

**Verdict: PASS — stripped from production builds.**

In SettingsScreen.tsx:
```tsx
{import.meta.env.DEV && user && <PushDiagnosticsPanel userId={user.id} />}
```

Vite replaces `import.meta.env.DEV` with the literal `false` in production builds, making the expression `false && user && ...`. The component is not rendered. The `PushDiagnosticsPanel` function body is still included in the production bundle (it is in the same file and TypeScript doesn't eliminate it), but it is never instantiated. No runtime overhead or accidental exposure.

If a hard guarantee of zero bundled code in production is required, the component should be moved to a separate file and imported conditionally using a dynamic `import()`. For current purposes this is acceptable.

---

## E. Deploy safety

### E1. Migration runs, old function code

**Verdict: SAFE.**

Old `send-notifications` code selects only `user_id, endpoint, p256dh, auth` from `push_subscriptions` and writes only to `check_ins.notified_at`. It never touches `last_delivery_attempt_at`, `last_delivery_error`, or `updated_at`. New nullable columns with defaults are ignored by the old code. ✅

---

### E2. New function code, migration not yet run

**Verdict: DEGRADED — delivery tracking fails, core delivery unaffected.**

The new code attempts:
```typescript
supabase.from('push_subscriptions').update({ last_delivery_attempt_at, last_delivery_error }).eq('endpoint', endpoint)
```

If `last_delivery_attempt_at` and `last_delivery_error` columns don't exist, Postgres returns an error. This update is wrapped in `Promise.allSettled` (lines 420–427):
```typescript
await Promise.allSettled(
  deliveryUpdates.map(({ endpoint, ... }) =>
    supabase.from('push_subscriptions').update(...).eq('endpoint', endpoint)
  )
);
```

The `allSettled` absorbs the error silently. The subsequent `notified_at` stamping, stale endpoint deletion, and batch completion all proceed normally. **Delivery is not broken — only tracking writes fail.**

**However:** This is still a degraded state that would make the new function useless for diagnostics. **Deploy order must be: migration → function → front-end.** Flag this clearly.

---

### E3. New SW + front-end, migration and function not yet deployed

**Verdict: SAFE for delivery, MINOR issue in DEV panel.**

- SW `pushsubscriptionchange` handler: re-subscribes, posts `SUBSCRIPTION_CHANGED` to clients. App.tsx handles this by calling `syncPushSubscription`, which only touches `push_subscriptions(endpoint, user_id, p256dh, auth)` — no new columns needed. ✅
- `syncPushSubscription` upsert: `{ user_id, endpoint, p256dh, auth }` only — no new columns. ✅
- Dev diagnostics panel: queries `last_delivery_attempt_at` and `last_delivery_error`. If columns don't exist, the Supabase query fails. The `setSubRow` call never receives valid data; the panel stays in "Loading…" state or displays stale data depending on how the error propagates. DEV-only issue; no production impact.

---

## Summary table

| # | Category | Verdict | Severity |
|---|---|---|---|
| A1 | null `oldSubscription` → re-subscribe fallback | Pass | — |
| A1 | null `oldSubscription` → old row cleanup | No proactive cleanup | Medium |
| A2 | `options.applicationServerKey` null fallback | Edge case, low risk | Low |
| A3 | Old row deletion after rotation | **Bug** — spec said delete by endpoint; only eventual 410/404 cleanup | Medium |
| A4 | Open-clients path | Pass | — |
| A4 | Pending-resub flag written | Pass | — |
| A4 | Pending-resub flag READ | **Flag** — flag is cleared, not checked; docstring misleading | Low |
| A5 | Handler catches re-subscribe failure | Pass | — |
| B1 | Sync checks DB even on non-null subscription | Pass | — |
| B2 | Sync compares exact endpoint | Pass | — |
| B3 | Trigger points | Pass — cold start + SUBSCRIPTION_CHANGED | — |
| B4 | Sync failure is silent | Pass | — |
| B5 | Sync before push_enabled known | Pass | — |
| B6 | Pending-resub flag read | See A4 | Low |
| C1 | `notified_at` stamp condition | Pass — 2xx only | — |
| C2 | Retry ceiling / expiry stamping | **Missing feature** — no infinite loop, but no terminal state | Low |
| C3 | Promise isolation | Pass — `Promise.all` with wrap, never rejects | — |
| C4 | Per-outcome table | Pass | — |
| D1 | Both endpoints shown | **Gap** — DB endpoint not shown as string | Low |
| D2 | Test notification flow | Pass | — |
| D3 | DEV gate | Pass | — |
| E1 | Migration before function | Safe | — |
| E2 | Function before migration | **Degraded** — tracking fails, delivery intact | Medium |
| E3 | SW/client before migration+function | Safe for delivery, DEV panel breaks | Low |

---

## Bugs requiring a decision

### Bug 1 — Old endpoint not deleted on rotation (A3)

**What:** When `pushsubscriptionchange` fires, the SW knows `oldEndpoint` and passes it in the `SUBSCRIPTION_CHANGED` message, but App.tsx never uses it to delete the old `push_subscriptions` row. The spec said "Delete the old row by endpoint."

**Impact:** Stale rows accumulate until `send-notifications` fires and gets 410/404. Delivery resumes on the next cron run (≤2 min) because the new endpoint is upserted. This is not a delivery-breaking bug but violates the spec intent.

**Fix (not applied):** In `App.tsx`, extract `event.data.oldEndpoint` in the SUBSCRIPTION_CHANGED handler and call `supabase.from('push_subscriptions').delete().eq('endpoint', oldEndpoint)` before or alongside `syncPushSubscription`.

---

### Bug 2 — Pending-resub flag never read (A4 / B6)

**What:** The SW writes the flag when no clients are open, intending for the next app open to use it. `syncPushSubscription` deletes it after a successful upsert but never reads it for any decision. The sync happens regardless (cold-start `useEffect`), so functionally there is no loss. But the flag's stored `oldEndpoint` is also discarded, which means the old row from a background rotation is never explicitly deleted.

**Impact:** Same as Bug 1 for the background case. The `oldEndpoint` data that could drive explicit deletion is written and thrown away.

**Fix (not applied):** Read the flag in `syncPushSubscription` before deleting it. Extract `oldEndpoint` from the JSON and issue a `push_subscriptions.delete().eq('endpoint', oldEndpoint)` if non-null.

---

### Missing feature — No expiry stamping for undelivered check-ins (C2)

**What:** The spec asked for check-ins >2 hours old with `notified_at IS NULL` to be stamped with an `expired_before_delivery` marker. Not implemented.

**Impact:** These check-ins remain `status='pending', notified_at=null` forever. No infinite retry (they age out of the ±90s query window). UI may show stale pending cards.

---

## Recommendation before deploy

Fix Bug 1 (old endpoint deletion) — it is a small, targeted change. Bugs 1 and 2 together address the same root gap and can be fixed in one edit to the SUBSCRIPTION_CHANGED handler in App.tsx plus one edit to `syncPushSubscription` to read the cache flag before deleting it. The missing feature (C2) can be deferred.

Deploy order: **migration → function → front-end** (required; E2 explains why).

---

## Remediation — applied 2026-04-18

All three issues flagged for pre-deploy action were fixed. A2 was deliberately deferred (see below).

---

### Fix 1 — Old endpoint proactively deleted after rotation (A3 + B6)

**Files changed:** `src/hooks/usePushNotifications.ts`, `src/App.tsx`

`syncPushSubscription` now accepts an optional `incomingOldEndpoint` parameter. At the start of the function, before any network call, the SW Cache flag at `/sw-pending-resub` is read. If present and `incomingOldEndpoint` was not already supplied by the caller, `oldEndpoint` is extracted from the cached JSON. This fixes the A4/B6 flag (flag was cleared but never read). After a successful upsert of the new endpoint, if `oldEndpoint` is non-null and differs from the new endpoint, a targeted `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?` is issued. The cache flag is cleared only after the delete succeeds (or was skipped because `oldEndpoint === newEndpoint`). If any step fails, `stateIsHealthy` remains `false` and the cache flag is left in place so the next cold start can retry.

In `App.tsx` the `SUBSCRIPTION_CHANGED` message handler now reads `event.data.oldEndpoint` and passes it to `syncPushSubscription(userId, oldEndpoint)`. The cold-start `useEffect` continues to call `syncPushSubscription(userId)` (no second argument) — the function itself will read the cache flag if one was written during a background rotation.

---

### Fix 2 — Expiry sweep for undelivered check-ins (C2)

**Files changed:** `supabase/functions/send-notifications/index.ts`, `src/lib/supabase.ts`, `src/components/history/HistoryScreen.tsx`, `src/components/history/MonthViewCalendar.tsx`, `src/lib/dataExport.ts`

An expiry sweep runs at the end of every cron invocation. It queries for check-ins with `status = 'pending'`, `notified_at IS NULL`, and `scheduled_at < (now − 2 hours)`. For each result it issues a conditional update using `.eq('status', 'pending')` as an optimistic lock preventing double-updates.

**Correction applied pre-deploy (2026-04-18):** The initial implementation set `status = 'expired_before_delivery'`, which is not a valid enum value — `check_ins.status` is a Postgres enum (`checkin_status`) with values `pending`, `completed`, `expired`. The audit incorrectly claimed it was plain `text` with no constraint. A baseline SQL check caught this before deploy.

The corrected approach sets `status = 'expired'` (the only valid terminal status for an un-completed check-in). The distinction between "notified then expired" and "expired before delivery" is expressed by `notified_at`: `status = 'expired' AND notified_at IS NOT NULL` means the user was notified but did not complete; `status = 'expired' AND notified_at IS NULL` means the push never succeeded before the check-in aged out. Each sweep update emits a structured log entry with `event: 'expired_unnotified_sweep'`.

Client-side changes (simplified — no special-case needed since the status is already `'expired'`):

- `src/lib/supabase.ts` — `CheckInStatus` type remains `'pending' | 'completed' | 'expired'` (reverted the `'expired_before_delivery'` addition)
- `src/components/history/HistoryScreen.tsx` — `classifyCheckIn` guard reverted to `status === 'expired'`; no compound check needed
- `src/components/history/MonthViewCalendar.tsx` — expired count filter reverted to `status === 'expired'`
- `src/lib/dataExport.ts` — domain-value suppression reverted to `status === 'expired'`

---

### Fix 3 — Both endpoint tails shown in diagnostics panel (D1)

**Files changed:** `src/components/settings/SettingsScreen.tsx`

The "Endpoint token" row in `PushDiagnosticsPanel` now shows the last 24 characters of both the browser endpoint and the DB endpoint on consecutive lines, coloured red on mismatch. Previously only the browser endpoint (first 80 chars) was visible, making it impossible to tell by inspection which endpoint was stale during a mismatch.

---

### A2 — Deliberately deferred

Finding A2 (null `applicationServerKey` inside a non-null `event.oldSubscription.options`) is a theoretical edge case with no real-world exposure: all Mosaic subscriptions have been created with a VAPID key since the app launched. Addressing it would require patching sw.js to deep-inspect `.options.applicationServerKey` and substitute the hardcoded fallback, adding complexity for zero practical benefit. **Deferred by user decision.**

---

### Deploy order remains unchanged

**migration → function → front-end** (see E2). One migration file: `20260418000002_push_subscriptions_delivery_tracking.sql` (adds `updated_at`, `last_delivery_attempt_at`, `last_delivery_error` to `push_subscriptions`). No migration is needed for the expiry sweep — it writes `status = 'expired'`, which is already a valid enum value. The migration must precede the new function deploy so delivery-tracking writes don't silently fail.
