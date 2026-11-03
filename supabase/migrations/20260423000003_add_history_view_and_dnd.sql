-- Add default history view preference to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'history_default_view'
  ) THEN
    ALTER TABLE profiles ADD COLUMN history_default_view TEXT NOT NULL DEFAULT 'week'
      CHECK (history_default_view IN ('list', 'week', 'calendar'));
  END IF;
END $$;

-- Add Do Not Disturb hours to check_in_settings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_in_settings' AND column_name = 'dnd_enabled'
  ) THEN
    ALTER TABLE check_in_settings
      ADD COLUMN dnd_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN dnd_start_time TIME,
      ADD COLUMN dnd_end_time TIME;
  END IF;
END $$;
