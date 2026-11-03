-- Manual rollback for supabase/migrations/20260813000001_body_tracking.sql.
--
-- This is NOT a migration and must not be placed in supabase/migrations/ —
-- the CLI applies files in that folder in filename order, and a same-timestamp
-- "down" file would run immediately after the up-migration and drop everything
-- it just created. Run this by hand (e.g. via the SQL editor or `psql -f`) only
-- if the body-tracking alpha needs to be fully reverted.
--
-- This repo otherwise has no down-migration convention (deprecated columns are
-- kept, not dropped — see 20260728000002_deprecate_track_sleep_preference.sql
-- and 20260623000001_drop_removed_feature_columns.sql for the usual pattern).
-- This file exists because the body-tracking spec asked for one explicitly.

DROP TRIGGER IF EXISTS set_body_checkins_updated_at ON body_checkins;
DROP TRIGGER IF EXISTS increment_body_checkin_edit_count ON body_checkins;

DROP TABLE IF EXISTS body_event_sites;
DROP TABLE IF EXISTS body_events;
DROP TABLE IF EXISTS body_pain_sites;
DROP TABLE IF EXISTS body_checkins;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS body_tracking_enabled,
  DROP COLUMN IF EXISTS body_available_from,
  DROP COLUMN IF EXISTS body_reminder_time,
  DROP COLUMN IF EXISTS body_backfill_days,
  DROP COLUMN IF EXISTS body_domains_active;
