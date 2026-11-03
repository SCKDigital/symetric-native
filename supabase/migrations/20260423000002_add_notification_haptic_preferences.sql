-- Add notification sound and haptic feedback preferences to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notification_sound_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notification_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'haptic_feedback_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN haptic_feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
