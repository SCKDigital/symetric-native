-- The in-progress (open) cycle has no confirmed next Day 1, so its phase can
-- only ever be a guess projected from median cycle length. This column lets
-- consumers (UI, luteal pattern detection) distinguish that guess from a
-- phase computed against two real Day 1 markers.

ALTER TABLE detected_clusters
ADD COLUMN IF NOT EXISTS cycle_phase_predicted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN detected_clusters.cycle_phase_predicted IS 'True when cycle_phase_context was projected from median cycle length (open cycle, no confirmed next Day 1) rather than computed against a real next Day 1 marker. Predicted phases must never feed luteal pattern detection.';
