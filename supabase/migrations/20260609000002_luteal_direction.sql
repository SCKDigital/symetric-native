-- Add direction column to luteal_symptom_patterns.
-- Records whether a domain's symptoms trend elevated or depressed during the
-- luteal phase, derived from the direction field on the underlying detected_clusters.
-- Existing rows default to 'elevated'; detectLutealPatterns() will recompute and
-- replace all rows on the user's next Cycle tab open (it does delete + insert).

ALTER TABLE luteal_symptom_patterns
  ADD COLUMN IF NOT EXISTS direction text
    DEFAULT 'elevated'
    CHECK (direction IN ('elevated', 'depressed'));

COMMENT ON COLUMN luteal_symptom_patterns.direction IS
  'Whether the domain trend is elevated or depressed relative to baseline during the luteal phase';

-- Also tighten the onset constraint to reflect the A2 anchor change:
-- typical_onset_day is now "days before period" (0–14), not "days after ovulation" (0–21).
-- Safe to run after detectLutealPatterns() has recomputed rows under the new anchor
-- (the lastLutealDetectionV2 storage key bump forces this on next app open).
ALTER TABLE luteal_symptom_patterns DROP CONSTRAINT IF EXISTS valid_onset;
ALTER TABLE luteal_symptom_patterns
  ADD CONSTRAINT valid_onset CHECK (typical_onset_day >= 0 AND typical_onset_day <= 14);
