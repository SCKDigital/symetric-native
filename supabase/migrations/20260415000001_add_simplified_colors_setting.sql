-- Add simplified_colors preference to profiles
-- Opt-in feature (default false) — uses a single indigo/slate palette instead
-- of per-domain colours. Applied in the UI; no data is changed.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'simplified_colors'
  ) THEN
    ALTER TABLE profiles ADD COLUMN simplified_colors BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
