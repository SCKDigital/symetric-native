-- Add medication_action to intervention_markers
-- Nullable: only medication-type markers use it; therapy/life_event leave it NULL.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'intervention_markers' AND column_name = 'medication_action'
  ) THEN
    ALTER TABLE intervention_markers
      ADD COLUMN medication_action text
      CHECK (medication_action IN ('start', 'stop', 'increase', 'decrease', 'other'));

    COMMENT ON COLUMN intervention_markers.medication_action IS
      'For medication markers only: start, stop, increase, decrease, other. NULL for other types.';
  END IF;
END $$;
