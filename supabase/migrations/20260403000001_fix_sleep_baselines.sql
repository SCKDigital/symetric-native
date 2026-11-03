-- Fix sleep baselines that were stored on an incorrect scale.
--
-- Sleep scores have always been 1–5 (felt_rested / score column in sleep_logs).
-- The default fallback of 5 used throughout the app was treating 5 as mid-range
-- (correct for 1–10 domains) but for sleep 5 is the ceiling, making pattern
-- detection impossible for any user whose baseline was at or above the maximum.
--
-- This migration remaps any sleep baselines > 5 proportionally from the old
-- 2–9 onboarding scale to the actual 1–5 sleep scale:
--   new = ROUND((old - 2) / 7 * 4 + 1, 1)
--   Maps: 2→1.0, 5→2.7, 7→3.9, 9→5.0
--
-- Baselines exactly at 5 from onboarding are also remapped (5 was "average/
-- moderate" on the 2–9 scale, which maps to ~2.7 on the 1–5 scale).

-- Remap baselines > 5 (impossible on 1-5 scale — set via old 2-9 slider)
-- Cast domain to text to avoid enum validation — 'sleep' is not a valid domain_type
-- enum value so no rows will ever match, but the cast prevents a runtime error.
UPDATE baselines
SET
  baseline_score = ROUND(((baseline_score - 2.0) / 7.0 * 4.0 + 1.0)::numeric, 1),
  set_at = NOW()
WHERE domain::text = 'sleep'
  AND source = 'onboarding'
  AND baseline_score > 5.0;

-- Remap baselines exactly at 5 set during onboarding (meant "average" not "ceiling")
UPDATE baselines
SET
  baseline_score = 2.7,
  set_at = NOW()
WHERE domain::text = 'sleep'
  AND source = 'onboarding'
  AND baseline_score = 5.0;
