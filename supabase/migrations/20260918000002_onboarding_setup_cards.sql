/*
  # Onboarding setup cards

  ## Why

  Onboarding stops after the consent screens and drops the user straight onto
  Today. The things the multi-step MindSetup wizard used to block on — domains,
  check-in times, body symptoms — become dismissible cards on the home screen
  instead, alongside a reminders prompt and, for cycle trackers, an optional
  "when did your last period start" backfill. Each card disappears once its job
  is done, and once they are all gone Today shows "Check in now" so a brand-new
  user can log something on their first visit rather than waiting for a
  scheduled slot.

  Baseline questions are removed entirely rather than becoming a card: the app
  computes baselines itself from the first fortnight of check-ins
  (lib/baseline/rollingBaselineRecalc.ts, 14 distinct days minimum). Until then
  a neutral row is seeded at domain selection with source='default', which the
  recalc supersedes with a real rolling median. That needs no schema change —
  baselines.source is NOT NULL DEFAULT 'onboarding' with no CHECK constraint.

  ## What this adds, and why each one is necessary

  Three of the five cards cannot work out their own state from existing data:

  - **Times.** Every check_in_settings column is NOT NULL with a DEFAULT
    (3/day, 09:00-21:00), so the row existing says nothing about whether anyone
    has looked at it. Needs an explicit marker.

  - **Reminders.** profiles.push_enabled is boolean NOT NULL DEFAULT false, so
    false means both "never asked" and "asked and declined". Enough to hide the
    card once notifications are on, not enough to stop it nagging someone who
    deliberately said no.

  Three cards need nothing new. Mind domains reads
  check_in_settings.active_domains (NOT NULL DEFAULT '{}', so empty is a real
  signal). Cycle Day 1 reads for an existing intervention_markers row with
  marker_type='cycle_phase', and only needs the "no thanks" case recording. And
  the body card uses profiles.body_setup_complete, which already exists and is
  already documented as "true once the user has been through the Set up Body
  tracking Today card" — an earlier design anticipated this exact card. Its
  timing fields (body_available_from default 17:00, body_reminder_time default
  21:00, body_morning_enabled/body_morning_time, body_backfill_days) all exist
  too, so the card can set opens-at and remind-me-at without any schema work.

  All three columns are nullable on purpose: absence means "not done yet", which
  is the state a new user starts in. This follows the existing
  domain_rotation_hint_dismissed_at convention on check_in_settings rather than
  introducing a different shape for the same idea.

  ## The backfill matters more than the columns

  Without it, every existing user opens the app to a screen full of setup cards
  for things they configured weeks ago.

  The mind-domain gate is `cardinality(active_domains) > 0`, deliberately not
  profiles.onboarding_complete. Consent now completes *before* setup, so
  onboarding_complete is true for people who genuinely have not picked domains
  yet, and those people should still see the cards.

  ## Verifying

    select count(*) filter (where setup_times_confirmed_at is null)   as times_pending,
           count(*) filter (where setup_notifications_ack_at is null) as notif_pending
    from check_in_settings;

  Before this runs both equal the row count; after, only users with no domains
  chosen should remain pending.
*/

-- ── Card state ──────────────────────────────────────────────────────────────

ALTER TABLE check_in_settings
  ADD COLUMN IF NOT EXISTS setup_times_confirmed_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS setup_notifications_ack_at timestamptz DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cycle_day_one_prompt_ack_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN check_in_settings.setup_times_confirmed_at IS
  'When the user confirmed their check-in window and frequency. Null means the "Confirm your check-in times" card is still showing. Needed because every column on this table has a NOT NULL default, so the row existing proves nothing.';

COMMENT ON COLUMN check_in_settings.setup_notifications_ack_at IS
  'When the user answered the reminders card, whether they enabled or declined. profiles.push_enabled only records success, so without this the card would re-prompt someone who said no.';

COMMENT ON COLUMN profiles.cycle_day_one_prompt_ack_at IS
  'When the user dismissed the optional "when did your last period start" card. The card also hides once an intervention_markers row with marker_type=''cycle_phase'' exists, so this only records the no-thanks case.';

-- ── Backfill: existing users have already done all of this ──────────────────

UPDATE check_in_settings
SET setup_times_confirmed_at   = COALESCE(setup_times_confirmed_at, now()),
    setup_notifications_ack_at = COALESCE(setup_notifications_ack_at, now())
WHERE cardinality(active_domains) > 0;

-- Body uses the pre-existing profiles.body_setup_complete rather than a new
-- column. Existing body trackers configured this through Settings, so mark
-- them done; the flag defaults to false for everyone else, which is correct.
UPDATE profiles
SET body_setup_complete = true
WHERE body_tracking_enabled = true AND body_setup_complete = false;

UPDATE profiles
SET cycle_day_one_prompt_ack_at = COALESCE(cycle_day_one_prompt_ack_at, now())
WHERE cycle_tracking_enabled = true;
