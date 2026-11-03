-- Optional first-name/nickname the user wants a clinical report to address
-- them by. Persisted on the profile (not per-appointment) since it rarely
-- changes. Nullable — an empty value means the report renders exactly as it
-- did before this column existed.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'report_display_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN report_display_name TEXT;
  END IF;
END $$;
