/*
  # Fix RLS Performance and Duplicate Policies

  1. RLS Policy Optimization
    - Replace `auth.uid()` with `(select auth.uid())` in all policies across:
      profiles, baselines, check_in_settings, check_ins, sleep_logs,
      detected_clusters, context_tags
    - This prevents re-evaluation of auth functions per-row, improving query performance

  2. Remove Duplicate Policies
    - context_tags: remove duplicate SELECT, INSERT, DELETE policies from v2 migration
    - detected_clusters: remove duplicate SELECT, INSERT, UPDATE policies from v2 migration

  3. Add Missing Foreign Key Indexes
    - check_in_settings.user_id
    - context_tags.user_id

  4. Remove Unused Indexes
    - idx_check_ins_scheduled_at
    - idx_sleep_logs_user_id
    - idx_detected_clusters_user_id
    - idx_context_tags_cluster_id
*/

-- ============================================================
-- PROFILES
-- ============================================================
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

-- ============================================================
-- CHECK_INS
-- ============================================================
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

-- ============================================================
-- SLEEP_LOGS
-- ============================================================
DROP POLICY IF EXISTS "Users can view own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can update own sleep_logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can delete own sleep_logs" ON sleep_logs;

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
-- DETECTED_CLUSTERS - drop all, recreate consolidated
-- ============================================================
DROP POLICY IF EXISTS "Users can view own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can insert own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can update own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can delete own detected_clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can select own clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can insert own clusters" ON detected_clusters;
DROP POLICY IF EXISTS "Users can update own clusters" ON detected_clusters;

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
-- CONTEXT_TAGS - drop all, recreate consolidated
-- ============================================================
DROP POLICY IF EXISTS "Users can view own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can insert own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can update own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can delete own context_tags" ON context_tags;
DROP POLICY IF EXISTS "Users can select own context tags" ON context_tags;
DROP POLICY IF EXISTS "Users can insert own context tags" ON context_tags;
DROP POLICY IF EXISTS "Users can delete own context tags" ON context_tags;

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

-- ============================================================
-- ADD MISSING FOREIGN KEY INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_check_in_settings_user_id ON check_in_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_context_tags_user_id ON context_tags(user_id);

-- ============================================================
-- REMOVE UNUSED INDEXES
-- ============================================================
DROP INDEX IF EXISTS idx_check_ins_scheduled_at;
DROP INDEX IF EXISTS idx_sleep_logs_user_id;
DROP INDEX IF EXISTS idx_detected_clusters_user_id;
DROP INDEX IF EXISTS idx_context_tags_cluster_id;
