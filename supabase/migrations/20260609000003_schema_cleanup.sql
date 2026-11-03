-- Schema cleanup — June 2026
--
-- 1. Drop unused check_ins columns (appetite, physical_wellbeing) — never read by the app
-- 2. Fix RLS policies on all post-schema tables to use (select auth.uid()) instead of
--    auth.uid() directly; the subquery form is evaluated once per statement rather than
--    once per row, giving a meaningful performance improvement on large datasets
-- 3. Add missing DELETE policy on milestones_achieved

-- ── 1. Drop unused columns ─────────────────────────────────────────────────────

ALTER TABLE check_ins DROP COLUMN IF EXISTS appetite;
ALTER TABLE check_ins DROP COLUMN IF EXISTS physical_wellbeing;


-- ── 2. Fix RLS policies: (select auth.uid()) ──────────────────────────────────

-- circadian_patterns
DROP POLICY IF EXISTS "Users can view own circadian patterns" ON circadian_patterns;
DROP POLICY IF EXISTS "Users can insert own circadian patterns" ON circadian_patterns;
DROP POLICY IF EXISTS "Users can update own circadian patterns" ON circadian_patterns;
DROP POLICY IF EXISTS "Users can delete own circadian patterns" ON circadian_patterns;
CREATE POLICY "Users can view own circadian patterns"    ON circadian_patterns FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own circadian patterns"  ON circadian_patterns FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own circadian patterns"  ON circadian_patterns FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own circadian patterns"  ON circadian_patterns FOR DELETE USING ((select auth.uid()) = user_id);

-- milestones_achieved (also adds missing DELETE policy)
DROP POLICY IF EXISTS "Users can view own milestones"   ON milestones_achieved;
DROP POLICY IF EXISTS "Users can insert own milestones" ON milestones_achieved;
DROP POLICY IF EXISTS "Users can update own milestones" ON milestones_achieved;
CREATE POLICY "Users can view own milestones"   ON milestones_achieved FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own milestones" ON milestones_achieved FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own milestones" ON milestones_achieved FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own milestones" ON milestones_achieved FOR DELETE USING ((select auth.uid()) = user_id);

-- intervention_markers
DROP POLICY IF EXISTS "Users can view own markers"   ON intervention_markers;
DROP POLICY IF EXISTS "Users can insert own markers" ON intervention_markers;
DROP POLICY IF EXISTS "Users can update own markers" ON intervention_markers;
DROP POLICY IF EXISTS "Users can delete own markers" ON intervention_markers;
CREATE POLICY "Users can view own markers"   ON intervention_markers FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own markers" ON intervention_markers FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own markers" ON intervention_markers FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own markers" ON intervention_markers FOR DELETE USING ((select auth.uid()) = user_id);

-- domain_connections
DROP POLICY IF EXISTS "domain_connections_select_own" ON domain_connections;
DROP POLICY IF EXISTS "domain_connections_insert_own" ON domain_connections;
DROP POLICY IF EXISTS "domain_connections_update_own" ON domain_connections;
DROP POLICY IF EXISTS "domain_connections_delete_own" ON domain_connections;
CREATE POLICY "domain_connections_select_own" ON domain_connections FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "domain_connections_insert_own" ON domain_connections FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "domain_connections_update_own" ON domain_connections FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "domain_connections_delete_own" ON domain_connections FOR DELETE USING ((select auth.uid()) = user_id);

-- sleep_symptom_connections
DROP POLICY IF EXISTS "Users can view own sleep connections"   ON sleep_symptom_connections;
DROP POLICY IF EXISTS "Users can insert own sleep connections" ON sleep_symptom_connections;
DROP POLICY IF EXISTS "Users can update own sleep connections" ON sleep_symptom_connections;
DROP POLICY IF EXISTS "Users can delete own sleep connections" ON sleep_symptom_connections;
CREATE POLICY "Users can view own sleep connections"   ON sleep_symptom_connections FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own sleep connections" ON sleep_symptom_connections FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own sleep connections" ON sleep_symptom_connections FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own sleep connections" ON sleep_symptom_connections FOR DELETE USING ((select auth.uid()) = user_id);

-- completion_patterns
DROP POLICY IF EXISTS "Users can view own patterns"  ON completion_patterns;
DROP POLICY IF EXISTS "Users can manage own patterns" ON completion_patterns;
CREATE POLICY "Users can view own patterns"   ON completion_patterns FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own patterns" ON completion_patterns FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own patterns" ON completion_patterns FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own patterns" ON completion_patterns FOR DELETE USING ((select auth.uid()) = user_id);

-- scheduling_preferences
DROP POLICY IF EXISTS "Users can view own scheduling preferences"   ON scheduling_preferences;
DROP POLICY IF EXISTS "Users can manage own scheduling preferences" ON scheduling_preferences;
CREATE POLICY "Users can view own scheduling preferences"   ON scheduling_preferences FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own scheduling preferences" ON scheduling_preferences FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own scheduling preferences" ON scheduling_preferences FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own scheduling preferences" ON scheduling_preferences FOR DELETE USING ((select auth.uid()) = user_id);

-- scheduling_suggestions
DROP POLICY IF EXISTS "Users can view own suggestions"   ON scheduling_suggestions;
DROP POLICY IF EXISTS "Users can manage own suggestions" ON scheduling_suggestions;
CREATE POLICY "Users can view own suggestions"   ON scheduling_suggestions FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own suggestions" ON scheduling_suggestions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own suggestions" ON scheduling_suggestions FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own suggestions" ON scheduling_suggestions FOR DELETE USING ((select auth.uid()) = user_id);

-- luteal_symptom_patterns
DROP POLICY IF EXISTS "Users can view their own luteal patterns"   ON luteal_symptom_patterns;
DROP POLICY IF EXISTS "Users can insert their own luteal patterns" ON luteal_symptom_patterns;
DROP POLICY IF EXISTS "Users can update their own luteal patterns" ON luteal_symptom_patterns;
DROP POLICY IF EXISTS "Users can delete their own luteal patterns" ON luteal_symptom_patterns;
CREATE POLICY "Users can view their own luteal patterns"   ON luteal_symptom_patterns FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert their own luteal patterns" ON luteal_symptom_patterns FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update their own luteal patterns" ON luteal_symptom_patterns FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete their own luteal patterns" ON luteal_symptom_patterns FOR DELETE USING ((select auth.uid()) = user_id);

-- historical_cycle_patterns
DROP POLICY IF EXISTS "Users can view their own historical patterns"   ON historical_cycle_patterns;
DROP POLICY IF EXISTS "Users can insert their own historical patterns" ON historical_cycle_patterns;
DROP POLICY IF EXISTS "Users can update their own historical patterns" ON historical_cycle_patterns;
DROP POLICY IF EXISTS "Users can delete their own historical patterns" ON historical_cycle_patterns;
CREATE POLICY "Users can view their own historical patterns"   ON historical_cycle_patterns FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert their own historical patterns" ON historical_cycle_patterns FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update their own historical patterns" ON historical_cycle_patterns FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete their own historical patterns" ON historical_cycle_patterns FOR DELETE USING ((select auth.uid()) = user_id);

-- appointments
DROP POLICY IF EXISTS "appointments_select_own" ON appointments;
DROP POLICY IF EXISTS "appointments_insert_own" ON appointments;
DROP POLICY IF EXISTS "appointments_update_own" ON appointments;
DROP POLICY IF EXISTS "appointments_delete_own" ON appointments;
CREATE POLICY "appointments_select_own" ON appointments FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "appointments_insert_own" ON appointments FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "appointments_update_own" ON appointments FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "appointments_delete_own" ON appointments FOR DELETE USING ((select auth.uid()) = user_id);

-- prepare_questions
DROP POLICY IF EXISTS "prepare_questions_select_own" ON prepare_questions;
DROP POLICY IF EXISTS "prepare_questions_insert_own" ON prepare_questions;
DROP POLICY IF EXISTS "prepare_questions_update_own" ON prepare_questions;
DROP POLICY IF EXISTS "prepare_questions_delete_own" ON prepare_questions;
CREATE POLICY "prepare_questions_select_own" ON prepare_questions FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "prepare_questions_insert_own" ON prepare_questions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "prepare_questions_update_own" ON prepare_questions FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "prepare_questions_delete_own" ON prepare_questions FOR DELETE USING ((select auth.uid()) = user_id);

-- prepare_pattern_reviews
DROP POLICY IF EXISTS "prepare_pattern_reviews_select_own" ON prepare_pattern_reviews;
DROP POLICY IF EXISTS "prepare_pattern_reviews_insert_own" ON prepare_pattern_reviews;
DROP POLICY IF EXISTS "prepare_pattern_reviews_update_own" ON prepare_pattern_reviews;
DROP POLICY IF EXISTS "prepare_pattern_reviews_delete_own" ON prepare_pattern_reviews;
CREATE POLICY "prepare_pattern_reviews_select_own" ON prepare_pattern_reviews FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "prepare_pattern_reviews_insert_own" ON prepare_pattern_reviews FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "prepare_pattern_reviews_update_own" ON prepare_pattern_reviews FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "prepare_pattern_reviews_delete_own" ON prepare_pattern_reviews FOR DELETE USING ((select auth.uid()) = user_id);
