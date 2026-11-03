/*
  # Auto-create profile on user signup via trigger

  ## Problem
  The app was trying to insert into `profiles` immediately after `supabase.auth.signUp()`,
  but the session (and thus the `authenticated` role) isn't established yet at that point.
  RLS blocks the insert because the request arrives as `anon`, not `authenticated`.

  ## Solution
  Use a `SECURITY DEFINER` trigger function that fires on `auth.users` INSERT.
  This runs with superuser privileges and bypasses RLS, guaranteeing the profile
  row is created atomically whenever a new user signs up.

  ## Changes
  - New function: `public.handle_new_user()` — creates a profile row from auth.users data
  - New trigger: `on_auth_user_created` on `auth.users` AFTER INSERT
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, onboarding_complete, track_sleep)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
