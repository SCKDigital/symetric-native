/*
  # Let comfort mode keep the reminders on

  ## Why

  An armed comfort window mutes every reminder push — mind check-ins, the
  evening body check-in, the morning one — for as long as it runs. The standing
  comfort_mode preference deliberately mutes nothing (see
  20260918000001_comfort_mode_state.sql for why that asymmetry exists).

  The muting is not free, and the cost is easy to miss. A check-in expires 30
  minutes after it is due, and the app is usually closed, so a two-hour window
  can quietly cost two check-ins and "rest of today" armed at midday can cost
  most of the day's. That is the worst possible time to lose coverage: someone
  arms comfort mode during a flare, which is exactly the stretch the report most
  needs recorded.

  For some people that trade is right — the whole point of the mode is to stop
  the phone asking things of them. For others the nudge is the only reason the
  day gets logged at all. Neither answer is correct for everyone, so it becomes
  a preference.

  ## Why a column rather than a third option on the sheet

  The arming sheet offers two durations and nothing else, on purpose: a picker
  is itself a demand, and this is the one moment in the app where the person is
  least able to meet one. So the choice lives in Settings, decided once while
  calm, and the sheet stays two taps.

  ## Default

  TRUE — muting is what happens today, and a schema change should not silently
  alter behaviour for anyone already relying on it.

  ## Note

  send-notifications reads this alongside comfort_until, in all three of its
  reminder paths. The function must be deployed BEFORE any app build that writes
  the column, and the column must exist before the function reads it.

  ## Verifying

    select comfort_pauses_reminders, count(*)
    from profiles group by 1;

  Every row should be true immediately after this runs.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS comfort_pauses_reminders boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.comfort_pauses_reminders IS
  'Whether an armed comfort window (comfort_until) also mutes reminder push. True by default, matching the behaviour that shipped. The standing comfort_mode preference never mutes, regardless of this.';
