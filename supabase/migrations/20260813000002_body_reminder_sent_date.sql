-- Body tracking (alpha) — reminder dedup guard.
--
-- send-notifications runs every 2 minutes (pg_cron '*/2 * * * *'), fixed to
-- even-minute clock boundaries. The body reminder has no scheduled row to
-- stamp notified_at on (unlike check_ins), so a ±90s "is it reminder time"
-- window alone double-sends for any body_reminder_time set to an odd minute
-- (half of all possible values) — two consecutive ticks both land inside it.
--
-- body_reminder_sent_date records the last local date a reminder was actually
-- sent for. Checked before sending (skip if it already equals today) and set
-- after a successful send. This is purely an anti-duplicate-send guard for
-- before the user has logged; the primary "already done" suppression is
-- still the existence of a body_checkins row for the day (see spec).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS body_reminder_sent_date date;

COMMENT ON COLUMN profiles.body_reminder_sent_date IS 'Local date the body-checkin reminder push was last sent. Prevents duplicate sends from consecutive cron ticks landing in the same reminder window.';
