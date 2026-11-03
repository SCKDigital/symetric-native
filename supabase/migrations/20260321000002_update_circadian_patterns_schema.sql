-- Drop old table and recreate with new schema (safe — feature wasn't producing results)
DROP TABLE IF EXISTS circadian_patterns CASCADE;

CREATE TABLE circadian_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain text NOT NULL,

  -- Time block averages (null if no data in that block)
  morning_avg numeric,
  morning_count integer NOT NULL DEFAULT 0,
  midday_avg numeric,
  midday_count integer NOT NULL DEFAULT 0,
  afternoon_avg numeric,
  afternoon_count integer NOT NULL DEFAULT 0,
  evening_avg numeric,
  evening_count integer NOT NULL DEFAULT 0,

  -- Metadata
  total_checkins integer NOT NULL,
  highest_block text NOT NULL,
  lowest_block text NOT NULL,
  range numeric NOT NULL,

  detection_window_start date NOT NULL,
  detection_window_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, domain)
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
CREATE INDEX idx_circadian_patterns_range ON circadian_patterns(user_id, range DESC);

-- Track one-time milestones per user
CREATE TABLE milestones_achieved (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_type text NOT NULL,
  achieved_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  UNIQUE(user_id, milestone_type)
);

ALTER TABLE milestones_achieved ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own milestones"
  ON milestones_achieved FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own milestones"
  ON milestones_achieved FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own milestones"
  ON milestones_achieved FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_milestones_user_id ON milestones_achieved(user_id);
