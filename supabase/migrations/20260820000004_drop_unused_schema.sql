-- Pre-launch schema tidy-up. Removes tables, an RPC, and columns confirmed to
-- have zero references anywhere in src/ or supabase/functions/ (audited
-- 2026-08-20). All drops use IF EXISTS so this migration is safe to re-run.

-- completion_patterns / scheduling_suggestions: "adaptive scheduling" feature
-- (2026-04-18) that was never wired into the UI. No .from() calls anywhere.
DROP TABLE IF EXISTS scheduling_suggestions;
DROP TABLE IF EXISTS completion_patterns;

-- schedule_checkins_for_user: superseded by direct check_ins inserts in
-- src/lib/scheduler.ts and supabase/functions/schedule-daily-checkins.
-- No .rpc() calls exist anywhere in the codebase.
DROP FUNCTION IF EXISTS schedule_checkins_for_user(uuid, date, jsonb);

-- detected_clusters: enrichment questionnaire columns that never shipped.
ALTER TABLE detected_clusters
  DROP COLUMN IF EXISTS sleep_affected,
  DROP COLUMN IF EXISTS felt_different_from_baseline,
  DROP COLUMN IF EXISTS intensity_shifted_quickly,
  DROP COLUMN IF EXISTS affected_more_than_expected;

-- profiles.track_sleep: already marked deprecated in 20260728000002, no
-- longer read anywhere. The signup trigger inserts it explicitly, so it
-- must be redefined first or every new signup breaks.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, onboarding_complete, push_enabled)
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

ALTER TABLE profiles
  DROP COLUMN IF EXISTS track_sleep;

-- check_ins.is_full_log: pre-pivot quick/full-log artifact, superseded by
-- active_domains, deprecated in 20260319000001, write-only since.
ALTER TABLE check_ins
  DROP COLUMN IF EXISTS is_full_log;

-- check_in_settings.domain_rotation_hint_dismissed_at: never read or written.
ALTER TABLE check_in_settings
  DROP COLUMN IF EXISTS domain_rotation_hint_dismissed_at;

-- scheduling_preferences: siblings of workday_mode_enabled /
-- midweek_simplification_enabled, which 20260623000001 already dropped.
-- These two were missed in that pass.
ALTER TABLE scheduling_preferences
  DROP COLUMN IF EXISTS adaptive_scheduling_enabled,
  DROP COLUMN IF EXISTS last_adaptation_date;
