/*
  Re-assert sleep_logs RLS policies.

  The full-schema migration created these policies but policy state in the
  live DB may diverge from migrations. This migration drops all existing
  sleep_logs policies and recreates them cleanly to guarantee INSERT and
  UPDATE are permitted for authenticated users on their own rows.
*/

-- Drop every known variant (handles both old and new naming)
DROP POLICY IF EXISTS "Users can view own sleep_logs"    ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert own sleep_logs"  ON sleep_logs;
DROP POLICY IF EXISTS "Users can update own sleep_logs"  ON sleep_logs;
DROP POLICY IF EXISTS "Users can delete own sleep_logs"  ON sleep_logs;
DROP POLICY IF EXISTS "Users can select own sleep logs"  ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert own sleep logs"  ON sleep_logs;
DROP POLICY IF EXISTS "Users can update own sleep logs"  ON sleep_logs;

-- Ensure RLS is enabled
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;

-- Recreate
CREATE POLICY "Users can view own sleep_logs"
  ON sleep_logs FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own sleep_logs"
  ON sleep_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own sleep_logs"
  ON sleep_logs FOR UPDATE
  TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own sleep_logs"
  ON sleep_logs FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
