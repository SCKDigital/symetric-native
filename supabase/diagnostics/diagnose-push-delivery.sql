-- =============================================================================
-- Push Delivery Diagnostics
-- Symetric — 2026-04
--
-- Usage: replace :target_user_id with the user's UUID (or use a psql \set).
-- DO NOT run this on production without care — it is read-only (SELECT only).
--
-- Healthy output:
--   push_subscriptions: 1–2 rows, created_at recent, updated_at recent
--   check_ins: all status='pending' or 'completed', notified_at populated for
--              scheduled_at values that are >90s in the past
--   no check-ins with scheduled_at well in the past AND notified_at IS NULL
--   no subscriptions untouched for >7 days
--
-- Broken output:
--   push_subscriptions: 0 rows — user has no subscription stored
--   push_subscriptions: 1+ rows with stale created_at and no updated_at —
--     subscription may have been rotated by Android/FCM but never refreshed
--   check_ins: several rows with scheduled_at well in the past, notified_at IS NULL
--     — send-notifications skipped them or they fell outside the ±90s window
--   check_ins: notified_at IS NOT NULL but user reports no notification received
--     — push was sent but delivery failed (stale endpoint, FCM refusal, etc.)
-- =============================================================================

-- Replace this with the actual user UUID before running
\set target_user_id '00000000-0000-0000-0000-000000000000'

-- -----------------------------------------------------------------------------
-- 1. Push subscriptions for the user
-- -----------------------------------------------------------------------------
SELECT
  'push_subscriptions' AS section,
  COUNT(*)             AS total_rows,
  MIN(created_at)      AS oldest_created_at,
  MAX(created_at)      AS newest_created_at,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') AS stale_count
FROM push_subscriptions
WHERE user_id = :'target_user_id';

-- Individual subscription rows (endpoint truncated for readability)
SELECT
  LEFT(endpoint, 60) || '…' AS endpoint_prefix,
  created_at,
  -- updated_at does not exist yet in the schema; add once migration lands
  CASE
    WHEN created_at < NOW() - INTERVAL '7 days' THEN 'STALE — not refreshed in >7 days'
    ELSE 'ok'
  END AS staleness
FROM push_subscriptions
WHERE user_id = :'target_user_id'
ORDER BY created_at DESC;

-- -----------------------------------------------------------------------------
-- 2. Last 20 check-ins with notification status
-- -----------------------------------------------------------------------------
SELECT
  id,
  scheduled_at,
  status,
  notified_at,
  CASE
    WHEN notified_at IS NOT NULL                         THEN 'notified'
    WHEN status = 'pending'
         AND scheduled_at < NOW() - INTERVAL '90 seconds'
         AND notified_at IS NULL                         THEN 'MISSED — past window, never notified'
    WHEN status = 'pending'
         AND scheduled_at BETWEEN NOW() - INTERVAL '90 seconds'
                               AND NOW() + INTERVAL '90 seconds' THEN 'in-window (due now)'
    WHEN status = 'pending'
         AND scheduled_at > NOW() + INTERVAL '90 seconds'       THEN 'future'
    ELSE 'other'
  END AS delivery_status
FROM check_ins
WHERE user_id = :'target_user_id'
ORDER BY scheduled_at DESC
LIMIT 20;

-- -----------------------------------------------------------------------------
-- 3. Check-ins that are overdue and were never notified
--    (scheduled_at > 90s ago, still pending, notified_at IS NULL)
--    These represent definite delivery failures.
-- -----------------------------------------------------------------------------
SELECT
  id,
  scheduled_at,
  status,
  NOW() - scheduled_at AS age,
  'DELIVERY FAILURE — past window, notified_at IS NULL' AS problem
FROM check_ins
WHERE user_id      = :'target_user_id'
  AND status       = 'pending'
  AND notified_at  IS NULL
  AND scheduled_at < NOW() - INTERVAL '90 seconds'
ORDER BY scheduled_at DESC;

-- -----------------------------------------------------------------------------
-- 4. Stale subscriptions across ALL users (admin view — for global triage)
--    Run only with service role / direct DB access.
-- -----------------------------------------------------------------------------
SELECT
  user_id,
  LEFT(endpoint, 60) || '…' AS endpoint_prefix,
  created_at,
  NOW() - created_at         AS age
FROM push_subscriptions
WHERE created_at < NOW() - INTERVAL '7 days'
ORDER BY created_at ASC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- 5. Global delivery health: check-ins sent vs missed in the last 48 hours
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*)                                                      AS total_checkins,
  COUNT(*) FILTER (WHERE notified_at IS NOT NULL)               AS notified,
  COUNT(*) FILTER (WHERE notified_at IS NULL
                     AND scheduled_at < NOW() - INTERVAL '90 seconds'
                     AND status = 'pending')                    AS missed_unnotified,
  COUNT(*) FILTER (WHERE notified_at IS NULL
                     AND status = 'completed')                  AS completed_without_notification
FROM check_ins
WHERE scheduled_at >= NOW() - INTERVAL '48 hours';

-- =============================================================================
-- 6. NATIVE (Expo) push — added 2026-09-20
--
-- Everything above predates the native app and looks only at
-- push_subscriptions, the Web Push table. The web PWA is obsolete, so on a
-- current install those sections return zero rows for a user whose push is
-- working perfectly. Native devices live in expo_push_tokens.
--
-- Healthy output:
--   one row per device the user has signed in on, updated_at recent (the app
--   re-registers its token on every launch — see symetric-native's
--   hooks/use-push-token-sync.ts)
--
-- Broken output:
--   0 rows with profiles.push_enabled = true — the app believes reminders are
--     on and the send path has nothing to send to. This is the state a
--     reinstall or a "clear app data" leaves behind on any build that
--     registers the token only from the Settings toggle.
--   updated_at older than the user's last app launch — the launch sync is
--     failing (check the client logs) or the build predates it.
--   a row whose token the Expo receipts API reports DeviceNotRegistered —
--     send-notifications deletes those itself, so a token that keeps coming
--     back means the app is re-registering a token the push service has
--     already retired.
-- -----------------------------------------------------------------------------
SELECT
  t.platform,
  LEFT(t.token, 28) || '…' AS token_prefix,
  t.created_at,
  t.updated_at,
  NOW() - t.updated_at     AS since_last_registration,
  CASE
    WHEN t.updated_at < NOW() - INTERVAL '7 days' THEN 'STALE — app has not re-registered in >7 days'
    ELSE 'ok'
  END AS staleness
FROM expo_push_tokens t
WHERE t.user_id = :'target_user_id'
ORDER BY t.updated_at DESC;

-- The state that produces "notifications are on but nothing arrives":
-- push_enabled true, no token row on either channel.
SELECT
  p.id,
  p.push_enabled,
  (SELECT COUNT(*) FROM expo_push_tokens e WHERE e.user_id = p.id)   AS expo_tokens,
  (SELECT COUNT(*) FROM push_subscriptions s WHERE s.user_id = p.id) AS web_subscriptions,
  CASE
    WHEN p.push_enabled
     AND NOT EXISTS (SELECT 1 FROM expo_push_tokens e WHERE e.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = p.id)
    THEN 'BROKEN — push_enabled with nowhere to send'
    ELSE 'ok'
  END AS verdict
FROM profiles p
WHERE p.id = :'target_user_id';

-- Same check across every user, for triage.
SELECT COUNT(*) AS users_with_push_enabled_and_no_destination
FROM profiles p
WHERE p.push_enabled
  AND NOT EXISTS (SELECT 1 FROM expo_push_tokens e   WHERE e.user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = p.id);
