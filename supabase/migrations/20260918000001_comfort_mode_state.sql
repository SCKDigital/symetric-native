/*
  # Comfort mode: an episodic state, not just a preference

  ## Why

  `profiles.comfort_mode` has existed since 20260423000001 as a boolean the
  web app read to apply a CSS class. The native app never read it at all
  (see the comment in src/app/settings.tsx) because the web implementation
  was `zoom: 1.12` + `filter: brightness(0.85)`, neither of which exists in
  React Native.

  Rebuilding it natively changed what the feature is. Being overstimulated is
  episodic — it happens at 4pm on a Tuesday, not as a standing preference set
  once in Settings while calm. So comfort mode now has two ways to be on:

    comfort_mode   = true            -> always on
    comfort_until  > now()           -> on until it expires, then off by itself

  A timestamp rather than a second boolean means it self-expires with no cron,
  no sweep, and no stale flag surviving a crash or a reinstall. The read is
  `comfort_mode OR comfort_until > now()` everywhere, client and server.

  ## What each one does

  Deliberately NOT the same set. The standing preference gets only the layers
  that are safe to leave on forever — quieter colours, larger type in the
  check-in flow, no expiry countdown. The episodic state additionally mutes
  reminder push and offers the one-tap "Nothing unusual today" check-in.

  That split is a data-quality decision, not a UI one. checkSustainedDeviationQuality
  rejects a window below 40% coverage or 1.5 check-ins/day outright. A user who
  turned comfort mode on permanently and stopped being reminded would drift
  under that floor and detection would go quiet — no error, no warning, just an
  app that stopped finding anything. Bounding the push mute to a timestamp means
  coverage always recovers on its own.

  ## check_ins.low_demand

  Marks a check-in submitted via the one-tap rather than by moving the sliders.
  The form already rests every slider at the user's own baseline, so a one-tap
  records "typical for me" — real data, but weaker evidence than five deliberate
  slider movements. Detection reads this to cap its confidence rather than to
  discard the row: a window mostly made of one-taps can reach 'partial', never
  'solid'.

  Nullable/defaulted so every existing row reads as a normal check-in.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'comfort_until'
  ) THEN
    ALTER TABLE profiles ADD COLUMN comfort_until TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN profiles.comfort_until IS
  'Comfort mode is active until this moment. NULL or past = not armed. Combined with comfort_mode (always-on) by the client and by send-notifications.';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_ins' AND column_name = 'low_demand'
  ) THEN
    ALTER TABLE check_ins ADD COLUMN low_demand BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

COMMENT ON COLUMN check_ins.low_demand IS
  'True when submitted via comfort mode''s one-tap "Nothing unusual today" rather than by moving the sliders. Caps detection confidence at partial; never excludes the row.';

-- send-notifications checks this on every run, for every user with a due
-- reminder. Partial: armed comfort windows are a small minority of rows.
CREATE INDEX IF NOT EXISTS idx_profiles_comfort_until
  ON profiles (comfort_until)
  WHERE comfort_until IS NOT NULL;
