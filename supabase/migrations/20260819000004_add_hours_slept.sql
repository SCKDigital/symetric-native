/*
  # Add hours_slept to sleep_logs

  - `hours_slept` — numeric(3,1), nullable, optional total hours slept
    captured alongside the existing subjective 1-5 quality score.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sleep_logs' AND column_name = 'hours_slept'
  ) THEN
    ALTER TABLE sleep_logs ADD COLUMN hours_slept numeric(3,1) DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sleep_logs' AND constraint_name = 'sleep_logs_hours_slept_range'
  ) THEN
    ALTER TABLE sleep_logs ADD CONSTRAINT sleep_logs_hours_slept_range
      CHECK (hours_slept IS NULL OR (hours_slept >= 0 AND hours_slept <= 24));
  END IF;
END $$;
