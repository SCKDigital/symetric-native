-- Cycle tracking — scoped resume (August 2026).
--
-- The Cycle tab, Prepare widget, and PDF report section stay paused behind
-- the CYCLE_FEATURE_ENABLED code flag (src/lib/constants.ts). This column is
-- a separate, narrower opt-in: it only gates the cycle_phase marker type
-- (logging a period start as an event) and the follicular/luteal/day-of-cycle
-- badge on History day cards. Same on/off pattern as body_tracking_enabled.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cycle_tracking_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.cycle_tracking_enabled IS 'Opt-in for period event markers and phase/day display in History. Independent of CYCLE_FEATURE_ENABLED, which still gates the Cycle tab, Prepare widget, and PDF report section.';
