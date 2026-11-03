CREATE TABLE circadian_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain text NOT NULL,
  high_block text NOT NULL,
  low_block text NOT NULL,
  high_block_avg numeric NOT NULL,
  low_block_avg numeric NOT NULL,
  difference numeric NOT NULL,
  sample_size_high integer NOT NULL,
  sample_size_low integer NOT NULL,
  detection_window_start date NOT NULL,
  detection_window_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE circadian_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own circadian patterns"
  ON circadian_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own circadian patterns"
  ON circadian_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own circadian patterns"
  ON circadian_patterns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own circadian patterns"
  ON circadian_patterns FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_circadian_patterns_user_id ON circadian_patterns(user_id);
CREATE INDEX idx_circadian_patterns_domain ON circadian_patterns(user_id, domain);
