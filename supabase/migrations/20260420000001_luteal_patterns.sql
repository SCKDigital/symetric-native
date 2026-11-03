-- Table for detected luteal-phase symptom patterns
CREATE TABLE luteal_symptom_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Which domains are involved
  primary_domains text[] NOT NULL,  -- e.g., ['mood', 'irritability']

  -- Temporal pattern
  typical_onset_day integer,        -- days after ovulation when symptoms typically start
  typical_duration_days integer,    -- how long symptoms typically last

  -- Cycle consistency
  cycles_observed integer NOT NULL, -- detected in X cycles
  total_cycles integer NOT NULL,    -- out of Y total cycles with data
  consistency_rate numeric,         -- X/Y as 0.0 to 1.0

  -- Severity
  avg_deviation numeric,            -- average deviation from baseline during luteal phase

  -- Resolution pattern
  resolves_with_period boolean DEFAULT false,  -- true if symptoms consistently end within 3 days of Day 1

  -- Detection metadata
  first_detected_at timestamptz DEFAULT now(),
  last_updated_at timestamptz DEFAULT now(),
  window_start date NOT NULL,       -- first cycle included in analysis
  window_end date NOT NULL,         -- most recent cycle included

  CONSTRAINT valid_consistency_rate CHECK (consistency_rate >= 0 AND consistency_rate <= 1),
  CONSTRAINT valid_onset CHECK (typical_onset_day >= 0 AND typical_onset_day <= 21),
  CONSTRAINT valid_duration CHECK (typical_duration_days >= 1 AND typical_duration_days <= 21)
);

-- RLS policies
ALTER TABLE luteal_symptom_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own luteal patterns"
  ON luteal_symptom_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own luteal patterns"
  ON luteal_symptom_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own luteal patterns"
  ON luteal_symptom_patterns
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own luteal patterns"
  ON luteal_symptom_patterns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for efficient queries
CREATE INDEX luteal_patterns_user_idx ON luteal_symptom_patterns(user_id);

-- Comments
COMMENT ON TABLE luteal_symptom_patterns IS 'Detected recurring symptom patterns in the luteal phase of the menstrual cycle';
COMMENT ON COLUMN luteal_symptom_patterns.primary_domains IS 'Symptom domains that worsen together in luteal phase';
COMMENT ON COLUMN luteal_symptom_patterns.typical_onset_day IS 'Days after ovulation when symptoms typically begin';
COMMENT ON COLUMN luteal_symptom_patterns.resolves_with_period IS 'Whether symptoms consistently improve within 3 days after period starts';
