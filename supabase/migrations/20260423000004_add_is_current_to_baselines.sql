-- ── Baselines: append-only is_current flag ────────────────────────────────────
--
-- Makes the baselines table append-only. Each recalculation (rolling_median,
-- manual_reset) flips the previous row to is_current=false and INSERTs a new
-- row with is_current=true, preserving history including onboarding baselines.
--
-- Detection and UI reads filter by is_current=true to see only the live row.
--
-- UNIQUE(user_id, domain) constraint: if one was added manually it must be
-- dropped — it fights append-only writes. The block below drops it if present.

-- 1. Drop UNIQUE(user_id, domain) if it exists (may have been added manually)
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'baselines'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%user_id%domain%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE baselines DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Dropped UNIQUE constraint % from baselines', v_constraint;
  END IF;
END $$;

-- 2. Add is_current column (default true so existing rows stay visible)
ALTER TABLE baselines
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- 3. Backfill: for each (user_id, domain) pair, keep only the most recent row
--    as is_current=true; set all earlier rows to false.
UPDATE baselines b
SET is_current = false
WHERE b.id NOT IN (
  SELECT DISTINCT ON (user_id, domain) id
  FROM baselines
  ORDER BY user_id, domain, set_at DESC
);

-- 4. Partial index — fast lookup for the current baseline per (user_id, domain)
CREATE INDEX IF NOT EXISTS idx_baselines_current
  ON baselines (user_id, domain)
  WHERE is_current = true;
