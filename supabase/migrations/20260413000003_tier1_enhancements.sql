/*
  # Tier 1 Enhancement Columns — April 2026

  Adds data quality tracking, sleep context, and internal sort weight
  to detected_clusters. All new columns are nullable so existing rows
  are unaffected.

  ## New columns on detected_clusters

  ### Data quality
  - data_points_used    integer  — check-in count used to detect this pattern
  - data_points_expected integer — check-ins we would expect given user's schedule
  - data_quality        text     — 'solid' | 'partial' | 'limited' (internal only)

  ### Sleep context
  - avg_sleep_during_pattern   numeric  — average sleep score during this cluster
  - improved_with_sleep        boolean  — domain improved as sleep quality improved
  - high_despite_poor_sleep    boolean  — energy stayed elevated even with poor sleep

  ### Internal priority sort
  - sort_weight  numeric  — calculated priority score for display ordering (never shown to user)
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'data_points_used'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN data_points_used integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'data_points_expected'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN data_points_expected integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'data_quality'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN data_quality text
      CHECK (data_quality IN ('solid', 'partial', 'limited'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'avg_sleep_during_pattern'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN avg_sleep_during_pattern numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'improved_with_sleep'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN improved_with_sleep boolean;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'high_despite_poor_sleep'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN high_despite_poor_sleep boolean;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'sort_weight'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN sort_weight numeric DEFAULT 1.0;
  END IF;
END $$;
