-- Optional morning body check-in — off by default. Morning and evening write
-- to the same body_checkins row (unique (user_id, entry_date) already holds)
-- but never share a column: morning_pain and pain are different measurements
-- taken at different points in the day, and the difference between them is
-- the point (waking stiff and worsening across the day is a different
-- signature to waking fine and crashing). Keep it to three scores — this is
-- a low-capacity moment of day.

ALTER TABLE body_checkins
ADD COLUMN IF NOT EXISTS morning_fatigue      smallint CHECK (morning_fatigue BETWEEN 0 AND 10),
ADD COLUMN IF NOT EXISTS morning_pain         smallint CHECK (morning_pain BETWEEN 0 AND 10),
ADD COLUMN IF NOT EXISTS morning_orthostatic  smallint CHECK (morning_orthostatic BETWEEN 0 AND 10),
ADD COLUMN IF NOT EXISTS morning_logged_at    timestamptz;

COMMENT ON COLUMN body_checkins.morning_logged_at IS 'Set once the morning check-in is logged for this row. Suppresses the morning reminder push, same pattern as the evening flow uses row existence.';

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS body_morning_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS body_morning_time    time NOT NULL DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS body_morning_reminder_sent_date date;

COMMENT ON COLUMN profiles.body_morning_enabled IS 'Opt-in, off by default. Master toggle for the optional morning body check-in.';
COMMENT ON COLUMN profiles.body_morning_time IS 'Local time the Today morning card starts showing, and the single daily morning-checkin push fires if not yet logged.';
COMMENT ON COLUMN profiles.body_morning_reminder_sent_date IS 'Local date the morning reminder push was last sent. Same dedup-guard purpose as body_reminder_sent_date (20260813000002).';
