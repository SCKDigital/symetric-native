-- Intervention markers: user-defined events (medication, therapy, life changes)
-- shown as vertical lines on domain charts.

CREATE TABLE IF NOT EXISTS intervention_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  marker_date date NOT NULL,
  label text NOT NULL,
  marker_type text NOT NULL CHECK (marker_type IN ('medication', 'therapy', 'life_event')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Row-level security
ALTER TABLE intervention_markers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intervention_markers' AND policyname = 'Users can view own markers'
  ) THEN
    CREATE POLICY "Users can view own markers"
      ON intervention_markers FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intervention_markers' AND policyname = 'Users can insert own markers'
  ) THEN
    CREATE POLICY "Users can insert own markers"
      ON intervention_markers FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intervention_markers' AND policyname = 'Users can update own markers'
  ) THEN
    CREATE POLICY "Users can update own markers"
      ON intervention_markers FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intervention_markers' AND policyname = 'Users can delete own markers'
  ) THEN
    CREATE POLICY "Users can delete own markers"
      ON intervention_markers FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Auto-update updated_at on every row update
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'intervention_markers'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON intervention_markers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Index for date-range queries (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_intervention_markers_user_date
  ON intervention_markers(user_id, marker_date DESC);
