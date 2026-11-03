-- Add day_one and ovulation to the medication_action CHECK constraint.
-- These values are used by cycle_phase markers (Day 1 and Predicted ovulation).
ALTER TABLE intervention_markers
  DROP CONSTRAINT IF EXISTS intervention_markers_medication_action_check;

ALTER TABLE intervention_markers
  ADD CONSTRAINT intervention_markers_medication_action_check
  CHECK (medication_action IN ('start', 'stop', 'increase', 'decrease', 'other', 'day_one', 'ovulation'));
