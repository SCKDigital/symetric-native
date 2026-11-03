-- Table for pre-Mositric historical cycle patterns from other sources (Clue, etc.)

CREATE TABLE historical_cycle_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Pattern description
  pattern_type text NOT NULL,  -- e.g., 'luteal_negative_emotions'
  pattern_summary text NOT NULL,  -- Human-readable: "Negative emotions in luteal phase"

  -- Frequency
  cycles_observed integer NOT NULL,
  total_cycles integer NOT NULL,
  consistency_rate numeric NOT NULL,

  -- Source tracking
  data_source text NOT NULL,  -- 'clue', 'flo', etc.
  window_start date NOT NULL,
  window_end date NOT NULL,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  notes text,  -- Optional context

  CONSTRAINT valid_consistency_rate CHECK (consistency_rate >= 0 AND consistency_rate <= 1)
);

-- RLS policies
ALTER TABLE historical_cycle_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own historical patterns"
  ON historical_cycle_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own historical patterns"
  ON historical_cycle_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own historical patterns"
  ON historical_cycle_patterns
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own historical patterns"
  ON historical_cycle_patterns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX historical_patterns_user_idx ON historical_cycle_patterns(user_id);

-- Comments
COMMENT ON TABLE historical_cycle_patterns IS 'Cycle patterns detected from historical data sources before Mositric tracking began';
COMMENT ON COLUMN historical_cycle_patterns.data_source IS 'Source app or method (e.g., clue, manual_diary)';
COMMENT ON COLUMN historical_cycle_patterns.pattern_summary IS 'User-friendly description of the pattern';
