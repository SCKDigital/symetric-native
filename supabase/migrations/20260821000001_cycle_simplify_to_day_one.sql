-- Simplify cycle tracking to Day 1 only. Removes the dormant clinical
-- luteal/follicular phase-comparison subsystem (never live for real users —
-- gated behind the CYCLE_FEATURE_ENABLED code flag, which this change also
-- retires) while leaving the already-live opt-in Day 1 marker / History
-- badge feature (profiles.cycle_tracking_enabled, intervention_markers
-- marker_type = 'cycle_phase') untouched.

-- Orphan any Prepare pattern rows sourced from luteal_symptom_patterns before
-- dropping that table and tightening the pattern_source CHECK below.
DELETE FROM prepare_pattern_reviews WHERE pattern_source = 'luteal';
DELETE FROM prepare_questions WHERE source_pattern_source = 'luteal';

ALTER TABLE prepare_pattern_reviews
  DROP CONSTRAINT IF EXISTS prepare_pattern_reviews_pattern_source_check;

ALTER TABLE prepare_pattern_reviews
  ADD CONSTRAINT prepare_pattern_reviews_pattern_source_check
  CHECK (pattern_source IN ('cluster', 'sleep_connection'));

ALTER TABLE prepare_questions
  DROP CONSTRAINT IF EXISTS prepare_questions_source_pattern_source_check;

ALTER TABLE prepare_questions
  ADD CONSTRAINT prepare_questions_source_pattern_source_check
  CHECK (source_pattern_source IN ('cluster', 'sleep_connection'));

-- Luteal-phase symptom pattern detection and imported historical cycle data
-- (CycleScreen.tsx, now removed) — no remaining reader anywhere in src/.
DROP TABLE IF EXISTS luteal_symptom_patterns;
DROP TABLE IF EXISTS historical_cycle_patterns;

-- Cluster-level phase enrichment (cycleContext.ts's enrichClustersWithCycleContext,
-- now removed) — detected_clusters keeps working as a general symptom-cluster
-- table without these columns.
ALTER TABLE detected_clusters
  DROP COLUMN IF EXISTS cycle_phase_context,
  DROP COLUMN IF EXISTS cycle_phase_predicted,
  DROP COLUMN IF EXISTS days_before_period,
  DROP COLUMN IF EXISTS days_after_period,
  DROP COLUMN IF EXISTS resolved_with_period,
  DROP COLUMN IF EXISTS cyclical_pattern_detected;

-- 'ovulation' was only ever reachable via the removed phase-tracking UI —
-- Add Event's Cycle type has always had a single Day 1 button. Null out any
-- stray rows before tightening the constraint.
UPDATE intervention_markers SET medication_action = NULL WHERE medication_action = 'ovulation';

ALTER TABLE intervention_markers
  DROP CONSTRAINT IF EXISTS intervention_markers_medication_action_check;

ALTER TABLE intervention_markers
  ADD CONSTRAINT intervention_markers_medication_action_check
  CHECK (medication_action IN ('start', 'stop', 'increase', 'decrease', 'other', 'day_one', 'mind', 'body'));
