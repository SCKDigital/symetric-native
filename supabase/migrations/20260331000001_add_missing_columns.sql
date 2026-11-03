-- Add columns that were only defined in CREATE TABLE IF NOT EXISTS and therefore
-- never applied to databases that already had these tables from earlier migrations.

-- detected_clusters: enrichment_completed, volatility_score, severity_score
ALTER TABLE detected_clusters
  ADD COLUMN IF NOT EXISTS enrichment_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS volatility_score numeric,
  ADD COLUMN IF NOT EXISTS severity_score numeric;

-- check_in_settings: time_format
ALTER TABLE check_in_settings
  ADD COLUMN IF NOT EXISTS time_format text NOT NULL DEFAULT '12hr';
