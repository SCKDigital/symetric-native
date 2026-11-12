# Offline mode

Entries made with no connection are saved on the phone and sent when the
connection comes back. Online, nothing looks different.

## What the user sees

- **Logging works the same.** Mind check-ins (form, one-tap, bonus, edit), body
  check-ins (evening, morning, one-tap), sleep, markers and Prepare questions
  all save at once.
- **Every screen has something to show.** Today and History use the last full
  read with unsent entries laid over it. Insights shows the last results it
  saved, with an "Offline · Showing insights from …" note, and re-reads once
  detection has run on the newly synced entries. Prepare shows the last
  appointments, clusters, markers and questions it read.
- **A line under Today's header**, only when there's something to say:
  "Offline · 2 entries will sync when you're back online", "Syncing", or
  "1 entry couldn't sync" with Retry and Discard.
- **The check-in confirmation** adds "Saved on this phone. It will sync when
  you're back online." when the entry was queued.
- **Needs a connection:** PDF report, export, delete a date range, delete the
  account. Each sends the queue first, so the result includes every entry and a
  delete can't be undone by an entry arriving afterwards.
- **Sign-out** warns when entries haven't synced. They stay on the phone under
  that account and sync the next time it signs in here.

## What works offline, and what can't

**Works offline (queued, applied at once through an overlay):**
- **Entries:** check-ins incl. one-tap, bonus and edits; body (evening, morning,
  one-tap); sleep; markers.
- **Today and Prepare:** rescheduling a check-in; appointments (add, edit,
  remove, mark done); questions; flagging a pattern for the report.
- **Settings and profile:** every Settings change (mind domains and baselines,
  body and cycle tracking, time format, check-in window and frequency, do not
  disturb, accent, app lock); comfort mode; setup cards. Profile changes are
  laid over the profile in `auth-context.tsx`, and check-in settings in each
  reader, via `overlayProfile` and `overlayCheckInSettings`.

**Genuinely needs the server, so it says "Unavailable offline"**
(`src/components/shared/offline-gate.tsx`):
- Sign-in (the link is emailed), and onboarding's final step (the server
  stamps consent with the request's IP).
- Turning push notifications on or off, and the test notification. These
  register or remove this phone with Expo.
- Export, delete a date range, delete account, reset baselines and the PDF
  report. They act on the server's copy, and send the queue first when online.
- The privacy and terms links, which are web pages.
- Content never loaded on this phone (Today's check-ins, History, Insights, a
  pattern's day-by-day scores, the events list, questions) gets an
  `OfflineUnavailable` card instead of an empty screen.

The helpers are `guardOnline(fn, 'What')` for buttons and `OfflineUnavailable`
for missing content.

**Never let a failed read look like real data.** These were all wrong offline
before this pass:
- Setup cards read missing settings as "nothing set up".
- The report count read a failed count as 0.
- The events list read a failed load as "no events".
- Insights built "no patterns" from empty reads.

If a read can fail, decide what "unknown" looks like.

## How it works

`src/lib/offline/`:

| file | job |
|---|---|
| `outbox.ts` | the queue: persisted per user in AsyncStorage, sent oldest first, one send at a time |
| `commands.ts` | each command's payload type and handler |
| `connectivity.ts` | NetInfo, as a hint for whether to try |
| `cache.ts` | last good copy of a read, used only when the read fails |
| `overlays.ts` | lays unsent entries over what a screen read |
| `session.ts` | the stored session, for when the token can't be refreshed offline |
| `read-through.ts` | wraps an API read so a failed one returns the last result (appointments, markers, questions, Prepare's clusters) |

`src/hooks/use-outbox-runner.ts` (mounted in `_layout.tsx`) sends the queue on
sign-in, on reconnect, on returning to the foreground, and every 30 s while
anything is waiting. **It also runs pattern detection after each sync**, so
screens no longer call `forcePatternDetection` after a save.

`submit()` saves the command to disk, then tries to send it, and returns:

- `synced`: the server accepted it.
- `queued`: the server couldn't be reached. The entry stays on the phone and is sent later.
- `rejected`: the server said no. The command is dropped and the caller shows its usual inline error.

A command rejected on a later, background send is kept as `failed` and shown on Today.

Network errors, 401, 408, 429 and 5xx responses are retried. Any other 4xx
response means the server has said no, so it isn't retried.

## Rules for a new write

1. **Go through `submit()`**, not `supabase.from(...).insert/update`, for
   anything a person enters.
2. **Handlers must be safe to run twice.** The app can die after the server
   accepts a write but before the command is removed from the queue.
   - Make ids on the phone (`Crypto.randomUUID()`) and use upsert with
     `ignoreDuplicates`, or upsert on a natural unique key.
   - Fix timestamps when the person saves, not when the command is sent. A fixed
     `edited_at` also keeps `edit_count` from counting a resend, because the
     trigger only counts a changed value.
   - Describe the state to end up in, not the steps to get there. `body.save`
     reconciles events against the server when it runs, and only deletes the
     types the form knew about.
3. **Overlay pending entries** on the screen that shows them, or an entry made
   offline will look missing, or come back as due.

## Startup offline

Two fixes that were needed even before the queue existed:

- **Profile:** a failed profile fetch used to set `profile = null`, which sent
  an onboarded user to Onboarding. It now falls back to the cached profile, and
  `refreshProfile` keeps the current profile on a failed read.
- **Session:** if the app opens more than an hour after the last token refresh,
  supabase-js can't refresh offline and reports `INITIAL_SESSION` with no
  session. That put the user on the sign-in screen. The session is still on disk
  (supabase-js only removes it for a revoked refresh token), so the app carries
  on with it, and auto-refresh renews it once the connection is back.
  `session.ts` reads supabase-js's private `storageKey`. If a future version
  renames it, the app falls back to the old behaviour.

Screens that have to re-read after a sync subscribe to `onSynced`, or, for
Insights, to `onDetectionAfterSync` from the runner, because its findings only
change once detection has run.

**Don't cache a read that swallows its errors.** `readThrough` only falls back
when the read throws. A function that returns `[]` on failure would overwrite
the saved copy with nothing; see `fetchClustersForDateRangeOrThrow`.

## Not covered yet

- **Insights' own settings bundle** (active domains, time format) doesn't
  overlay unsent settings changes. Its findings are server-derived anyway and
  update after sync.
- **Insights doesn't overlay unsent entries.** Its findings come from server
  detection, so they update after sync, as intended.
- **No check-ins scheduled yet.** If the phone is offline from before the
  server cron has scheduled the day, Today has no check-ins to answer. A bonus
  check-in still works.
- **Today's expiry updates** are skipped offline. They are recomputed on the
  next load that has a connection.
