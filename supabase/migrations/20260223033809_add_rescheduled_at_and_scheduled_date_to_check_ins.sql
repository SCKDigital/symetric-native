/*
  # Add rescheduled_at and scheduled_date to check_ins

  ## Changes

  ### check_ins table
  - Added `rescheduled_at` column: timestamptz, nullable — records when a check-in was rescheduled (used to enforce the one-reschedule limit)
  - Added `scheduled_date` column: date, generated from scheduled_at in local-ish terms via a stored value — used to efficiently query "did we already generate check-ins for today?" without timezone issues

  ## Notes
  - Both columns are nullable/optional so existing rows are unaffected
  - scheduled_date is populated by the app at insert time using the local date string
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_ins' AND column_name = 'rescheduled_at'
  ) THEN
    ALTER TABLE check_ins ADD COLUMN rescheduled_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_ins' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE check_ins ADD COLUMN scheduled_date date DEFAULT NULL;
  END IF;
END $$;
