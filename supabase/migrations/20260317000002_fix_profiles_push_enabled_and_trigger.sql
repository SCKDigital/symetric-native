/*
  # Fix: profiles.push_enabled column + trigger

  ## Problem
  The Profile TypeScript interface includes push_enabled (boolean), and the
  Onboarding component writes to it. But no migration ever added this column
  to the profiles table.

  If push_enabled was added manually in the Supabase Dashboard without a
  DEFAULT value, the handle_new_user() trigger fails on every signup because
  it tries to INSERT a row without supplying push_enabled, which violates the
  NOT NULL constraint → "Database error saving new user".

  ## Fix
  1. Add push_enabled to profiles with NOT NULL DEFAULT false (safe if it
     already exists — ADD COLUMN IF NOT EXISTS).
  2. Ensure the DEFAULT is set even if the column was added without one.
  3. Replace handle_new_user() so the INSERT explicitly names every non-null
     column, removing any dependence on implicit defaults at INSERT time.
*/

-- 1. Add the column if it doesn't exist yet
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false;

-- 2. Ensure the default is set (no-op if already correct; safe to run)
ALTER TABLE profiles
  ALTER COLUMN push_enabled SET DEFAULT false;

-- 3. Replace the trigger function — explicitly lists all non-default columns
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
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged; recreating it is harmless
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
