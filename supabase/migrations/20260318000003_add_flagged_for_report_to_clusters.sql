-- Add flagged_for_report column to detected_clusters
-- Allows users to mark specific patterns for discussion at appointments

ALTER TABLE detected_clusters
ADD COLUMN IF NOT EXISTS flagged_for_report boolean DEFAULT false;
