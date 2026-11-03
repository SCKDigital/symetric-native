/*
  Sleep tracking is now standard for every user, not an opt-in preference.
  The app no longer reads profiles.track_sleep anywhere — every surface
  (Today, History, Insights, the PDF report) shows/uses sleep data purely
  based on whether sleep_logs exist, degrading gracefully to "nothing shown"
  when they don't.

  The column is kept (not dropped) so this is reversible. It is deprecated:
  do not read it in application code.
*/

-- 1. Backfill existing users to enabled, matching the new "always on" behaviour.
UPDATE profiles SET track_sleep = true WHERE track_sleep = false;

-- 2. New profiles should default to enabled too.
ALTER TABLE profiles ALTER COLUMN track_sleep SET DEFAULT true;

-- 3. Update the signup trigger to match (mirrors the profiles default).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, onboarding_complete, track_sleep, push_enabled)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN profiles.track_sleep IS
  'DEPRECATED: sleep tracking is standard for all users now. Column retained for reversibility; not read by the app.';
