-- Age verification and consent capture for the reworked onboarding flow.
-- All columns nullable/defaulted with no backfill — existing onboarded users
-- are grandfathered in and never re-prompted (gated on profiles.onboarding_complete,
-- which they already have set). Body/cycle yes-no answers reuse the existing
-- body_tracking_enabled / cycle_tracking_enabled columns directly rather than
-- adding new ones — the onboarding answer IS the toggle.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS date_of_birth              date,
ADD COLUMN IF NOT EXISTS age_confirmed_18            boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mind_not_health_service_ack boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mind_data_consent           boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mind_consent_recorded_at    timestamptz,
ADD COLUMN IF NOT EXISTS body_consent_recorded_at    timestamptz,
ADD COLUMN IF NOT EXISTS cycle_consent_recorded_at   timestamptz;

COMMENT ON COLUMN profiles.date_of_birth IS 'Collected at onboarding for the 18+ age gate. Nullable — grandfathered users never provided it.';
COMMENT ON COLUMN profiles.age_confirmed_18 IS 'The "I confirm I am 18 years or older" checkbox, recorded alongside the real computed-age gate from date_of_birth.';
COMMENT ON COLUMN profiles.mind_not_health_service_ack IS 'Acknowledgment that Symetric is not a mental health service, health device, or diagnostic tool.';
COMMENT ON COLUMN profiles.mind_data_consent IS 'Consent to collect and store mental-domain data and any added context/events.';
COMMENT ON COLUMN profiles.mind_consent_recorded_at IS 'Timestamp both Mind consent checkboxes were recorded together as one consent event.';
COMMENT ON COLUMN profiles.body_consent_recorded_at IS 'Set only when the user opts into physical symptom tracking during onboarding (alongside body_tracking_enabled=true). Null if never opted in.';
COMMENT ON COLUMN profiles.cycle_consent_recorded_at IS 'Set only when the user opts into cycle tracking during onboarding (alongside cycle_tracking_enabled=true). Null if never opted in.';
