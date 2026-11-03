/*
  # Mositric — Full schema creation

  Creates all application tables that were missing from the database:
  - profiles
  - baselines
  - check_in_settings
  - check_ins
  - sleep_logs
  - detected_clusters
  - context_tags

  All tables have RLS enabled with secure per-user policies.
  All changes are safe to re-run (IF NOT EXISTS throughout).
*/

-- ============================================================
-- SHARED HELPERS
-- ============================================================
-- update_updated_at_column() is used by every "updated_at" trigger added in
-- later migrations (intervention_markers, body_checkins, etc). Defined once
-- here, at the true baseline, so a from-zero `supabase db reset` never hits
-- a missing-function error partway through the chain. Added 2026-08-13 —
-- editing this already-applied migration is a deliberate, narrow exception
-- (CREATE OR REPLACE is idempotent and a no-op against the live DB, where
-- this function already existed ad hoc before migrations tracked it).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  timezone text NOT NULL DEFAULT 'UTC',
  onboarding_complete boolean NOT NULL DEFAULT false,
  track_sleep boolean NOT NULL DEFAULT false
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- ============================================================
-- BASELINES
-- ============================================================
CREATE TABLE IF NOT EXISTS baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  baseline_score numeric NOT NULL,
  baseline_variability numeric,
  set_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'onboarding'
);

ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own baselines" ON baselines;
DROP POLICY IF EXISTS "Users can insert own baselines" ON baselines;
DROP POLICY IF EXISTS "Users can update own baselines" ON baselines;
DROP POLICY IF EXISTS "Users can delete own baselines" ON baselines;

CREATE POLICY "Users can view own baselines"
  ON baselines FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own baselines"
  ON baselines FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own baselines"
  ON baselines FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own baselines"
  ON baselines FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- CHECK_IN_SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS check_in_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_ins_per_day integer NOT NULL DEFAULT 3,
  window_start text NOT NULL DEFAULT '09:00',
  window_end text NOT NULL DEFAULT '21:00',
  quick_checkin_domains text[] NOT NULL DEFAULT '{}',
  time_format text NOT NULL DEFAULT '12hr',
  morning_reminder_enabled boolean NOT NULL DEFAULT false,
  domain_rotation_hint_dismissed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE check_in_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own check_in_settings" ON check_in_settings;
DROP POLICY IF EXISTS "Users can insert own check_in_settings" ON check_in_settings;
DROP POLICY IF EXISTS "Users can update own check_in_settings" ON check_in_settings;
DROP POLICY IF EXISTS "Users can delete own check_in_settings" ON check_in_settings;

CREATE POLICY "Users can view own check_in_settings"
  ON check_in_settings FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own check_in_settings"
  ON check_in_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own check_in_settings"
  ON check_in_settings FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own check_in_settings"
  ON check_in_settings FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS idx_check_in_settings_user_id ON check_in_settings(user_id);

-- ============================================================
-- CHECK_INS
-- ============================================================
CREATE TABLE IF NOT EXISTS check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  scheduled_date date DEFAULT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz DEFAULT NULL,
  rescheduled_at timestamptz DEFAULT NULL,
  is_full_log boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  mood integer,
  energy integer,
  anxiety integer,
  concentration integer,
  irritability integer,
  social_battery integer,
  sensory_sensitivity integer,
  motivation integer,
  appetite integer,
  physical_wellbeing integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own check_ins" ON check_ins;
DROP POLICY IF EXISTS "Users can insert own check_ins" ON check_ins;
DROP POLICY IF EXISTS "Users can update own check_ins" ON check_ins;
DROP POLICY IF EXISTS "Users can delete own check_ins" ON check_ins;

CREATE POLICY "Users can view own check_ins"
  ON check_ins FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own check_ins"
  ON check_ins FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own check_ins"
  ON check_ins FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own check_ins"
  ON check_ins FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_scheduled_date ON check_ins(user_id, scheduled_date);

-- ============================================================
-- SLEEP_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  score integer DEFAULT NULL,
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date)
);

ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can update own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can delete own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can select own sleep logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert own sleep logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can update own sleep logs" ON sleep_logs;

CREATE POLICY "Users can view own sleep_logs"
  ON sleep_logs FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own sleep_logs"
  ON sleep_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own sleep_logs"
  ON sleep_logs FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own sleep_logs"
  ON sleep_logs FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- DETECTED_CLUSTERS
-- ============================================================
CREATE TABLE IF NOT EXISTS detected_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  ongoing boolean NOT NULL DEFAULT true,
  cluster_type text,
  direction text DEFAULT 'elevated',
  domains_involved text[] NOT NULL DEFAULT '{}',
  severity_score numeric,
  volatility_score numeric,
  user_notes text,
  sleep_affected boolean,
  felt_different_from_baseline boolean,
  intensity_shifted_quickly boolean,
  affected_more_than_expected boolean,
  enrichment_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE detected_clusters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can insert own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can update own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can delete own detected_clusters" ON detected_clusters;

CREATE POLICY "Users can view own detected_clusters"
  ON detected_clusters FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own detected_clusters"
  ON detected_clusters FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own detected_clusters"
  ON detected_clusters FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own detected_clusters"
  ON detected_clusters FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- CONTEXT_TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS context_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_id uuid NOT NULL REFERENCES detected_clusters(id) ON DELETE CASCADE,
  tag text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE context_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can insert own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can update own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can delete own context_tags" ON context_tags;

CREATE POLICY "Users can view own context_tags"
  ON context_tags FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own context_tags"
  ON context_tags FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own context_tags"
  ON context_tags FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own context_tags"
  ON context_tags FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS idx_context_tags_user_id ON context_tags(user_id);

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
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
