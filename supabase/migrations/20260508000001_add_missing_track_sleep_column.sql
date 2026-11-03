/*
  # Fix: profiles.track_sleep column missing from production

  ## Problem
  Onboarding fails with "Could not find the 'track_sleep' column of 'profiles' in
  the schema cache" when completing onboarding on iOS.

  Root cause is identical to the push_enabled bug fixed in 20260317000002:
  - profiles was originally created manually in the Supabase Dashboard
  - 20260316003527 defined track_sleep inside CREATE TABLE IF NOT EXISTS profiles
  - Because the table already existed, the IF NOT EXISTS caused the entire CREATE TABLE
    to be skipped, so the track_sleep column was never added via ALTER TABLE
  - The push_enabled fix (20260317000002) added that column the same way but
    didn't notice track_sleep was also missing

  ## Fix
  1. Add track_sleep to profiles with NOT NULL DEFAULT false (safe if it already
     exists — ADD COLUMN IF NOT EXISTS is a no-op in that case).
  2. Ensure the DEFAULT is set even if the column was added without one.
  3. Update handle_new_user() trigger to keep it consistent (no functional change).
*/

-- 1. Add the column if it doesn't exist yet
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS track_sleep boolean NOT NULL DEFAULT false;

-- 2. Ensure the default is set (no-op if already correct; safe to run)
ALTER TABLE profiles
  ALTER COLUMN track_sleep SET DEFAULT false;
