-- Drop columns for four features removed from the UI:
--   workday mode         → scheduling_preferences
--   midweek simplification → scheduling_preferences
--   morning reminder     → check_in_settings
--   notification sound   → profiles
--
-- All drops use IF EXISTS so this migration is safe to re-run or apply
-- to an environment where any column was already removed manually.

ALTER TABLE scheduling_preferences
  DROP COLUMN IF EXISTS workday_mode_enabled,
  DROP COLUMN IF EXISTS midweek_simplification_enabled;

ALTER TABLE check_in_settings
  DROP COLUMN IF EXISTS morning_reminder_enabled;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS notification_sound_enabled;
