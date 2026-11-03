/*
  # Mositric v1.4 database changes

  ## New columns on check_in_settings
  - `morning_reminder_enabled` (boolean, default false) — controls daily orientation notification
  - `domain_rotation_hint_dismissed_at` (timestamptz, nullable) — records when user dismissed the domain rotation hint; null means never dismissed

  ## New table: sleep_logs
  - Replaces the old sleep_logs felt_rested integer scale with a proper score column
  - `id` — uuid primary key
  - `user_id` — uuid, references auth.users
  - `log_date` — date (local date, not UTC)
  - `score` — integer (2, 4, 5, 7, or 9), nullable (null = skipped)
  - `skipped` — boolean, default false
  - `created_at` — timestamptz, default now()
  - RLS enabled: users can only access their own rows

  ## Notes
  - All changes are additive; no existing data is affected
  - The old sleep_logs table may have a different schema — this migration creates the table if it does not exist
    and adds the new columns; if sleep_logs already exists we add the score and skipped columns
*/

-- Add new columns to check_in_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_in_settings' AND column_name = 'morning_reminder_enabled'
  ) THEN
    ALTER TABLE check_in_settings ADD COLUMN morning_reminder_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_in_settings' AND column_name = 'domain_rotation_hint_dismissed_at'
  ) THEN
    ALTER TABLE check_in_settings ADD COLUMN domain_rotation_hint_dismissed_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Create sleep_logs table (or add missing columns if it already exists)
CREATE TABLE IF NOT EXISTS sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  score integer DEFAULT NULL,
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date)
);

-- Add score column if table existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sleep_logs' AND column_name = 'score'
  ) THEN
    ALTER TABLE sleep_logs ADD COLUMN score integer DEFAULT NULL;
  END IF;
END $$;

-- Add skipped column if table existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sleep_logs' AND column_name = 'skipped'
  ) THEN
    ALTER TABLE sleep_logs ADD COLUMN skipped boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sleep_logs' AND policyname = 'Users can select own sleep logs'
  ) THEN
    CREATE POLICY "Users can select own sleep logs"
      ON sleep_logs FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sleep_logs' AND policyname = 'Users can insert own sleep logs'
  ) THEN
    CREATE POLICY "Users can insert own sleep logs"
      ON sleep_logs FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sleep_logs' AND policyname = 'Users can update own sleep logs'
  ) THEN
    CREATE POLICY "Users can update own sleep logs"
      ON sleep_logs FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
