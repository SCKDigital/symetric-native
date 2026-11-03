/*
  # Add time_format to check_in_settings and rescheduled_at to check_ins

  ## Changes

  ### check_in_settings table
  - Added `time_format` column: text, either '12hr' or '24hr', default '12hr'
    - Stores the user's preferred time display format app-wide

  ### check_ins table
  - Added `rescheduled_at` column: timestamptz, nullable, default null
    - Non-null value indicates the one-shot reschedule for that check-in has been used

  ## Notes
  - Both changes are additive (no data loss)
  - Existing rows will get default values automatically
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_in_settings' AND column_name = 'time_format'
  ) THEN
    ALTER TABLE check_in_settings ADD COLUMN time_format text NOT NULL DEFAULT '12hr';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_ins' AND column_name = 'rescheduled_at'
  ) THEN
    ALTER TABLE check_ins ADD COLUMN rescheduled_at timestamptz DEFAULT NULL;
  END IF;
END $$;
