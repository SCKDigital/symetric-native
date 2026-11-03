/*
  # Mositric v2 — Cluster detection schema updates

  ## Changes to detected_clusters
  - Add `direction` column (text: 'elevated' | 'depressed') — the primary direction of the cluster
  - The existing `ongoing` boolean is kept for compatibility; detection logic will also set `end_date`
  - Ensure RLS is fully configured for insert/update/select

  ## Changes to context_tags
  - Add `is_custom` boolean column (default false) — distinguishes preset tags from user-typed ones
  - Ensure RLS is fully configured

  ## Notes
  - All changes are additive; no existing data is affected
  - Uses IF NOT EXISTS / DO $$ patterns for safe re-runs
*/

-- Add direction column to detected_clusters
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detected_clusters' AND column_name = 'direction'
  ) THEN
    ALTER TABLE detected_clusters ADD COLUMN direction text DEFAULT 'elevated';
  END IF;
END $$;

-- Ensure RLS is enabled on detected_clusters
ALTER TABLE detected_clusters ENABLE ROW LEVEL SECURITY;

-- detected_clusters SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'detected_clusters' AND policyname = 'Users can select own clusters'
  ) THEN
    CREATE POLICY "Users can select own clusters"
      ON detected_clusters FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- detected_clusters INSERT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'detected_clusters' AND policyname = 'Users can insert own clusters'
  ) THEN
    CREATE POLICY "Users can insert own clusters"
      ON detected_clusters FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- detected_clusters UPDATE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'detected_clusters' AND policyname = 'Users can update own clusters'
  ) THEN
    CREATE POLICY "Users can update own clusters"
      ON detected_clusters FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Add is_custom column to context_tags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'context_tags' AND column_name = 'is_custom'
  ) THEN
    ALTER TABLE context_tags ADD COLUMN is_custom boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add created_at column to context_tags if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'context_tags' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE context_tags ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Ensure RLS is enabled on context_tags
ALTER TABLE context_tags ENABLE ROW LEVEL SECURITY;

-- context_tags SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'context_tags' AND policyname = 'Users can select own context tags'
  ) THEN
    CREATE POLICY "Users can select own context tags"
      ON context_tags FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- context_tags INSERT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'context_tags' AND policyname = 'Users can insert own context tags'
  ) THEN
    CREATE POLICY "Users can insert own context tags"
      ON context_tags FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- context_tags DELETE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'context_tags' AND policyname = 'Users can delete own context tags'
  ) THEN
    CREATE POLICY "Users can delete own context tags"
      ON context_tags FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
