-- Seventh body domain: exhaustion, evening-only. Distinct from fatigue —
-- fatigue is the day's overall body heaviness, exhaustion is the state at the
-- point of logging (end of day). Appended, never inserted, so historical row
-- ordering (BODY_DOMAIN_ORDER) stays stable.

ALTER TABLE body_checkins
ADD COLUMN IF NOT EXISTS exhaustion smallint CHECK (exhaustion BETWEEN 0 AND 10);

ALTER TABLE profiles
ALTER COLUMN body_domains_active SET DEFAULT
  ARRAY['fatigue', 'pain', 'joint_instability', 'orthostatic', 'gut', 'exertion', 'exhaustion'];
