/*
  # Setup card 6: privacy and comfort

  ## Why

  The five cards from 20260918000002 ask for everything the app needs to
  *function* — domains, hours, reminders, body symptoms, cycle day one — and
  nothing it merely offers. Everything optional stayed in Settings: the app-lock
  PIN, comfort mode, the morning body check-in, quiet hours, 12- vs 24-hour
  time.

  That split looked principled and wasn't. This app's users are frequently
  exhausted, and "go and browse Settings to find out what else exists" is a real
  barrier for them specifically — the people most likely to want a PIN on their
  health data, or a quieter screen, are the least likely to go hunting for one.
  Four of those five gaps fold into cards that already exist (morning check-in
  into Body, quiet hours and time format into the times card). App lock and
  comfort mode have no such home, so they get the sixth and final card.

  Deliberately still NOT cards: export, delete a date range, reset baselines and
  delete account. Those are actions taken later against data that does not exist
  yet on day one, not setup choices.

  ## What this adds

  One nullable timestamp, same shape and reasoning as setup_times_confirmed_at:
  every column on check_in_settings has a NOT NULL default, so the row existing
  proves nothing about whether the user has seen this card. The card is entirely
  optional — both "Done" and "Not now" stamp it, because a card that keeps
  coming back after you have declined it is a nag, not an offer.

  ## Verifying

    select count(*) filter (where setup_preferences_ack_at is null) as prefs_pending
    from check_in_settings;

  After this runs, only users who have yet to choose their domains should remain
  pending — everyone already using the app is backfilled.
*/

-- ── Card state ──────────────────────────────────────────────────────────────

ALTER TABLE check_in_settings
  ADD COLUMN IF NOT EXISTS setup_preferences_ack_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN check_in_settings.setup_preferences_ack_at IS
  'When the user answered the optional "privacy and comfort" setup card — app lock and comfort mode — whether they set something up or dismissed it. Null means the card is still showing.';

-- ── Backfill: existing users already have these in Settings ─────────────────
--
-- Same gate as 20260918000002: a non-empty active_domains means this is an
-- established user who has already been through setup, not someone mid-way
-- through it. Anyone who has not picked domains yet is still setting up and
-- should be offered the card with the rest.

UPDATE check_in_settings
SET setup_preferences_ack_at = COALESCE(setup_preferences_ack_at, now())
WHERE cardinality(active_domains) > 0;
