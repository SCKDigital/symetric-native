-- Track user's actual completion patterns over time
CREATE TABLE completion_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- Time-of-day patterns
  hour_of_day integer NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  completion_count integer NOT NULL DEFAULT 0,
  scheduled_count integer NOT NULL DEFAULT 0,
  completion_rate numeric GENERATED ALWAYS AS (
    CASE
      WHEN scheduled_count > 0 THEN (completion_count::numeric / scheduled_count::numeric)
      ELSE 0
    END
  ) STORED,

  -- Day-type patterns
  day_type text NOT NULL CHECK (day_type IN ('weekday', 'weekend')),

  -- Analysis window
  window_start date NOT NULL,
  window_end date NOT NULL,

  -- Metadata
  last_updated timestamptz DEFAULT now(),

  UNIQUE(user_id, hour_of_day, day_type, window_start)
);

-- Performance index
CREATE INDEX idx_completion_patterns_user_window
  ON completion_patterns(user_id, window_end DESC);

-- Enable RLS
ALTER TABLE completion_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patterns"
  ON completion_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own patterns"
  ON completion_patterns FOR ALL
  USING (auth.uid() = user_id);

-- ─── Scheduling Preferences ───────────────────────────────────────────────────

CREATE TABLE scheduling_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

  -- Adaptive scheduling
  adaptive_scheduling_enabled boolean DEFAULT false,
  last_adaptation_date date,

  -- Workday awareness
  workday_mode_enabled boolean DEFAULT false,
  workday_start_hour integer CHECK (workday_start_hour >= 0 AND workday_start_hour <= 23),
  workday_end_hour integer CHECK (workday_end_hour >= 0 AND workday_end_hour <= 23),

  -- Simplified check-ins
  midweek_simplification_enabled boolean DEFAULT false,

  -- Recovery mode
  last_gap_recovery_shown timestamptz,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE scheduling_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduling preferences"
  ON scheduling_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own scheduling preferences"
  ON scheduling_preferences FOR ALL
  USING (auth.uid() = user_id);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_scheduling_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scheduling_preferences_updated_at
  BEFORE UPDATE ON scheduling_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduling_preferences_timestamp();

-- ─── Scheduling Suggestions ───────────────────────────────────────────────────

CREATE TABLE scheduling_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- Suggestion details
  suggestion_type text NOT NULL CHECK (suggestion_type IN (
    'avoid_hour',
    'prefer_hour',
    'workday_mode',
    'weekend_adjustment',
    'simplify_midweek'
  )),
  suggested_at timestamptz DEFAULT now(),

  -- What we observed
  observation_summary text NOT NULL,

  -- What we're suggesting
  suggestion_details jsonb NOT NULL,

  -- User response
  user_response text CHECK (user_response IN ('accepted', 'dismissed', 'pending')),
  responded_at timestamptz,

  -- Metadata
  dismissed_reason text
);

-- Index for pending suggestions
CREATE INDEX idx_scheduling_suggestions_pending
  ON scheduling_suggestions(user_id, suggested_at DESC)
  WHERE user_response = 'pending';

-- Enable RLS
ALTER TABLE scheduling_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own suggestions"
  ON scheduling_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own suggestions"
  ON scheduling_suggestions FOR ALL
  USING (auth.uid() = user_id);
