-- Migration: 20260422000001_checkin_notified_at.sql
--
-- Adds `notified_at` to check_ins so send-notifications can:
--   1. Widen its look-ahead window back to +90s (matches the look-back, robust against
--      pg_cron jitter of up to ~90 s) without risk of double-sending.
--   2. Mark each check-in the moment a push is successfully dispatched, so subsequent
--      cron runs skip it even when it's still in the look-ahead window.
--
-- Index covers the hot path:  pending + unnotified + recent scheduled_at.

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS notified_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_check_ins_pending_unnotified
  ON check_ins (scheduled_at)
  WHERE status = 'pending' AND notified_at IS NULL;
