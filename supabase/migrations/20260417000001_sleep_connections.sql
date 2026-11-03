-- Sleep-symptom connections table
-- Stores weekly-computed analysis of how sleep quality affects each domain
CREATE TABLE sleep_symptom_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  domain text NOT NULL,
  affected_by_sleep boolean NOT NULL,
  avg_after_good_sleep numeric NOT NULL,
  avg_after_poor_sleep numeric NOT NULL,
  difference numeric NOT NULL,
  sample_size integer NOT NULL,
  good_sleep_count integer NOT NULL,
  poor_sleep_count integer NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  detected_at timestamptz DEFAULT now(),
  UNIQUE(user_id, domain, window_start)
);

ALTER TABLE sleep_symptom_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sleep connections"
  ON sleep_symptom_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep connections"
  ON sleep_symptom_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sleep connections"
  ON sleep_symptom_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sleep connections"
  ON sleep_symptom_connections FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_sleep_connections_user_detected
  ON sleep_symptom_connections(user_id, detected_at DESC);
