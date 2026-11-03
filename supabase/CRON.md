# Scheduled jobs

**The migrations are not the source of truth for cron. This file is.**

Production runs four `pg_cron` jobs. One is described by a migration that carries
an unsubstituted placeholder, one has its migration commented out entirely, and
two appear nowhere in this repo at all. Anyone reading `supabase/migrations/`
will conclude that scheduling is broken when it isn't — that exact mistake was
made on 2026-09-15, and acting on it would have overwritten three working jobs.

Everything below was read from production on 2026-09-15.

---

## The four jobs

| jobid | name | schedule | calls | what it does |
|---|---|---|---|---|
| 12 | `schedule-daily-checkins` | `0 * * * *` | `schedule-daily-checkins` | Generates each user's check-ins for their local day. Idempotent; skips users already scheduled. |
| 1 | `send-checkin-notifications` | `*/5 * * * *` | `send-push` | One push per check-in that came due in the last five minutes. |
| 13 | `send-push-notifications` | `*/2 * * * *` | `send-notifications` | Notification fan-out. Returns `{"sent":0}` when there is nothing queued. |
| 2 | `recalculate-rolling-baselines` | `0 3 * * 1` | — | Plain SQL. Sets `baselines.baseline_score` from a rolling median. No HTTP call. |

**The two notification jobs are named the opposite way round from the function
they call.** `send-checkin-notifications` calls `send-push`; `send-push-notifications`
calls `send-notifications`. Both work. Don't "fix" the names without re-reading
the commands — the names are wrong, not the wiring.

## The secret

All three HTTP jobs send `Authorization: Bearer <CRON_SECRET>`, matched against
the `CRON_SECRET` Edge Function secret. It is not in this repo and must not be.

### Rotating it

Rotating `CRON_SECRET` means updating **every** job that carries it, in the same
sitting. On 2026-09-15 the secret was rotated and only two of the three jobs were
updated. The third kept the old token, so every push it sent came back 401 — and
nothing surfaced that, because `cron.job_run_details` records the job as
`succeeded` whether the request was accepted or rejected.

To update a job without the secret ever appearing on screen, copy it from a job
that is known to be working:

```sql
DO $$
DECLARE good_token text;
BEGIN
  SELECT substring(command from 'Bearer ([^'']+)') INTO good_token
  FROM cron.job WHERE jobname = 'schedule-daily-checkins';

  IF good_token IS NULL THEN
    RAISE EXCEPTION 'Could not read the working token';
  END IF;

  PERFORM cron.schedule('<job name>', '<schedule>', format($cmd$
    <command, with %s where the token goes>
  $cmd$, good_token));
END $$;
```

`cron.schedule` upserts by job name, so there is no unschedule step that could
leave you with no job at all if something fails partway.

---

## Checking that it works

### Are the jobs registered, and do their tokens agree?

```sql
SELECT jobid, jobname, schedule, active,
       substring(command from 'functions/v1/([a-z-]+)')  AS calls,
       md5(substring(command from 'Bearer ([^''"]+)'))   AS token_fingerprint
FROM cron.job
ORDER BY jobid;
```

Every HTTP job must show the **same** `token_fingerprint`. A job that differs is
401ing silently. `recalculate-rolling-baselines` shows null — it makes no request.

### Is anything actually succeeding?

```sql
SELECT status_code, count(*) AS n, left(content, 60) AS body, max(created) AS most_recent
FROM net._http_response
WHERE created > now() - interval '2 hours'
GROUP BY status_code, left(content, 60)
ORDER BY n DESC;
```

Expect roughly 60 rows from the 2-minute job, 24 from the 5-minute job when
check-ins are falling due, and 2 from the hourly one.

**Do not check `cron.job_run_details` alone.** It reports `succeeded` for a
request that was *sent*, including one that came back 401. That is why this went
unnoticed for months, twice.

A `succeeded` row whose `return_message` is `0 rows` is normal for
`send-checkin-notifications`: its command is a `SELECT ... FROM check_ins WHERE`,
so it posts nothing when nothing is due.

---

## Why the migrations look broken

- `20260318000001_schedule_daily_checkins_cron.sql` — registers
  `schedule-daily-checkins` with the literal `YOUR_SERVICE_ROLE_KEY`.
- `20260609000001_cron_secret_auth.sql` — supersedes it with the literal
  `YOUR_CRON_SECRET_HERE`.
- `20260317000001_push_subscriptions_and_cron.sql` — its `cron.schedule` call is
  commented out in full.

Production was fixed by hand instead, which is why those placeholders never
mattered — and why re-running any of them against production would break it.
Leave them alone; they are a record of how this started, not of how it is.

---

## Not scheduled: a deferred Expo receipt check

`send-notifications` reads Expo delivery receipts inside the run that sent the
messages, five seconds later. That is deliberately partial. Expo's docs
recommend reading receipts **fifteen minutes** after sending and guarantee
nothing sooner, so the in-run check catches only the errors that resolve
immediately — `InvalidCredentials`, `MismatchSenderId`, `DeviceNotRegistered` —
and treats anything still pending as delivered.

That is the right trade for a job that runs every two minutes, but it means a
receipt that resolves slowly is never read by anything. What is missing is a
job that reads them properly:

1. A table of tickets awaiting a verdict — receipt id, token, check-in id,
   sent-at — written by `send-notifications` as it sends.
2. A function on a 15-minute schedule that reads receipts for rows older than
   fifteen minutes and younger than 24 hours (Expo discards them after that),
   deletes `DeviceNotRegistered` tokens, clears `notified_at` where nothing
   was delivered, and deletes the rows it has resolved.
3. A fifth `pg_cron` job to call it, carrying the same `CRON_SECRET` as the
   others — see **Rotating it** above; a new job is one more place the secret
   has to be kept in step.

Until that exists, the honest statement of what the database knows is: a
`notified_at` timestamp means Expo accepted the message and did not
immediately reject it. A user-triggered Settings → "Send test notification" is
the only path that checks a specific device end to end.
