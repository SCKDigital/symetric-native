-- Add Prepare tab settings and appointment date to profiles

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prepare_tab_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_appointment_date date;

COMMENT ON COLUMN profiles.prepare_tab_enabled IS
  'Whether the Prepare tab is visible in navigation. Users can hide it if they don''t need appointment workflows. Default true.';

COMMENT ON COLUMN profiles.next_appointment_date IS
  'Optional next appointment date. Used for context in Prepare tab. No reminders in MVP.';
