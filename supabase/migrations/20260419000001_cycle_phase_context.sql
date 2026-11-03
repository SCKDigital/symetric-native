-- Add cycle phase context columns to detected_clusters
-- Enriched after detection by checking proximity to cycle_phase intervention markers

ALTER TABLE detected_clusters
ADD COLUMN IF NOT EXISTS cycle_phase_context text CHECK (
  cycle_phase_context IN ('luteal', 'follicular', 'menstrual')
),
ADD COLUMN IF NOT EXISTS days_before_period integer,
ADD COLUMN IF NOT EXISTS days_after_period integer,
ADD COLUMN IF NOT EXISTS resolved_with_period boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS cyclical_pattern_detected boolean DEFAULT false;

COMMENT ON COLUMN detected_clusters.cycle_phase_context IS 'Which phase of menstrual cycle this cluster occurred in: luteal (ovulation to Day 1), follicular (Day 1 to ovulation), menstrual (Day 1 to Day 5)';
COMMENT ON COLUMN detected_clusters.days_before_period IS 'How many days before next Day 1 marker this cluster started (NULL if no marker nearby)';
COMMENT ON COLUMN detected_clusters.days_after_period IS 'How many days after previous Day 1 marker this cluster started';
COMMENT ON COLUMN detected_clusters.resolved_with_period IS 'True if cluster ended within 3 days after a Day 1 marker';
COMMENT ON COLUMN detected_clusters.cyclical_pattern_detected IS 'True if this luteal-phase pattern has repeated 3+ times across cycles';
