/*
  # Comfort mode's one-tap, extended to body check-ins

  ## Why

  check_ins.low_demand (20260918000001_comfort_mode_state.sql) marks a mind
  check-in submitted via comfort mode's "Nothing unusual today" rather than by
  moving the sliders. body_checkins has never had the equivalent column,
  because the body check-in card never offered a one-tap at all — comfort
  mode muted the reminder to log a body check-in (send-notifications'
  isComfortMuted) but did nothing to make actually logging one easier, which
  is backwards for the person it exists for: body domains (pain,
  breathlessness, orthostatic, gut, exhaustion) are exactly what's hardest to
  rate in detail during a bad hour.

  The evening body check-in form already rests every untouched slider at that
  domain's own rolling baseline (see body-check-in.tsx) — submitting without
  touching anything already records "typical for me", the same semantics as
  the mind one-tap. The only missing piece was a button that submits that
  state directly, skipping the form, and a flag so detection can tell it
  apart from a deliberate rating the same way it already does for mind.

  ## body_checkins.low_demand

  Same contract as check_ins.low_demand: marks a row submitted via the
  one-tap. Detection reads it to cap confidence at 'partial' rather than to
  discard the row — see streak-cluster-helper.ts's upsertStreakCluster,
  already generic over mind and body before this column existed, just always
  called with lowDemandInPeriod=0 for body since there was nothing to count.

  Nullable/defaulted so every existing row reads as a normal check-in.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'body_checkins' AND column_name = 'low_demand'
  ) THEN
    ALTER TABLE body_checkins ADD COLUMN low_demand BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

COMMENT ON COLUMN body_checkins.low_demand IS
  'True when submitted via comfort mode''s one-tap rather than by moving the sliders. Caps detection confidence at partial; never excludes the row. Mirrors check_ins.low_demand.';
