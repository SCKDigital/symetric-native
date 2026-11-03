-- Push notification health diagnostics
-- Run in Supabase Dashboard → SQL Editor

-- ── 1. Check how many push subscriptions exist per user ──────────────────────
-- Multiple rows per user = multi-device (fine) or stale subscription churn (bad).
-- Users with > 1 subscription should be verified — confirm they really use multiple browsers.
SELECT
  ps.user_id,
  COUNT(*) AS subscription_count,
  MIN(ps.created_at) AS oldest_subscription,
  MAX(ps.created_at) AS newest_subscription,
  p.push_enabled
FROM push_subscriptions ps
JOIN profiles p ON p.id = ps.user_id
GROUP BY ps.user_id, p.push_enabled
ORDER BY subscription_count DESC;

-- ── 2. Check pending check-ins in the last 2 hours that were never notified ──
-- These represent missed notifications — check-ins that passed through the cron
-- window without being sent.
SELECT
  id,
  user_id,
  scheduled_at,
  expires_at,
  notified_at,
  status,
  now() - scheduled_at AS age
FROM check_ins
WHERE status = 'pending'
  AND notified_at IS NULL
  AND scheduled_at < now()
  AND scheduled_at > now() - interval '2 hours'
ORDER BY scheduled_at DESC;

-- ── 3. Check recent notification dispatch rate ────────────────────────────────
-- Shows how many check-ins per hour were successfully notified vs missed.
SELECT
  date_trunc('hour', scheduled_at) AS hour,
  COUNT(*) FILTER (WHERE notified_at IS NOT NULL) AS notified,
  COUNT(*) FILTER (WHERE notified_at IS NULL AND scheduled_at < now()) AS missed,
  COUNT(*) AS total
FROM check_ins
WHERE scheduled_at > now() - interval '48 hours'
GROUP BY 1
ORDER BY 1 DESC;

-- ── 4. Verify the pg_cron job is registered and check its last run ────────────
-- If job_run_details shows frequent errors, the cron auth may have expired.
SELECT jobname, schedule, active, nodename, nodeport
FROM cron.job
WHERE jobname = 'send-push-notifications';

-- Last 20 cron runs for the send-notifications job:
SELECT
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-push-notifications')
ORDER BY start_time DESC
LIMIT 20;

-- ── 5. Check if notified_at column exists (migration applied?) ────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'check_ins' AND column_name = 'notified_at';
