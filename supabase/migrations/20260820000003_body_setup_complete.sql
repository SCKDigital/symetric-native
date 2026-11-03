-- Tracks whether the user has been through the "Set up Body tracking" Today
-- card (domains, timing, morning check-in) — separate from
-- body_tracking_enabled, which only records the onboarding yes/no. Body
-- tracking's domain/timing columns always carry non-null DB defaults, so
-- there's no way to tell "user confirmed these" from "still on defaults"
-- without an explicit flag, unlike Mind setup (gated on active_domains
-- being empty).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS body_setup_complete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.body_setup_complete IS 'True once the user has completed (or dismissed) the Today-tab Body setup card. Gates whether that card still shows.';

-- Anyone who already has body tracking on predates this card entirely —
-- don't surface it retroactively for existing users.
UPDATE profiles SET body_setup_complete = true WHERE body_tracking_enabled = true;
