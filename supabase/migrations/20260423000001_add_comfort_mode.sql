-- Add comfort_mode preference to profiles
-- Master toggle: easier-to-read font + reduced brightness + no animations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'comfort_mode'
  ) THEN
    ALTER TABLE profiles ADD COLUMN comfort_mode BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
