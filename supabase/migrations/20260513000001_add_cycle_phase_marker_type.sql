-- Add cycle_phase to the intervention_markers CHECK constraint.
-- The column uses a text CHECK constraint (not a PG enum), so we drop and recreate it.
ALTER TABLE intervention_markers
  DROP CONSTRAINT IF EXISTS intervention_markers_marker_type_check;

ALTER TABLE intervention_markers
  ADD CONSTRAINT intervention_markers_marker_type_check
  CHECK (marker_type IN ('medication', 'therapy', 'life_event', 'cycle_phase'));
