/*
  # Cap scheduled check-ins at the user's own setting

  ## Why

  ensureTodayCheckIns does a read-then-write — "any check-ins for today? no?
  schedule them" — and generates randomised times within bands. Two calls
  racing each other both see nothing scheduled, both generate a *different*
  set of times, and both inserts succeed. The existing unique constraint on
  (user_id, scheduled_date, scheduled_at) can't catch that: the timestamps
  genuinely differ.

  The web app calls it from an App.tsx effect and from TodayScreen's, both
  firing on load, so the race fires most days. At least one account has been
  getting 8 check-ins a day on a 4-a-day setting since June.

  The client-side fix (a shared in-flight promise, plus scheduling only once
  per local day) is in both apps. This is the backstop: it holds regardless of
  which app version a device is running, which matters because an installed
  build keeps its old behaviour until the user updates.

  ## What it does

  A BEFORE INSERT trigger. Returning NULL skips that row silently, so a
  scheduler inserting four rows when three slots remain gets three, with no
  error surfaced to the client.

  Two things it deliberately does not touch:

  - Bonus check-ins. Those are inserted with status='completed' and a null
    scheduled_date, and are meant to be extra. Only rows that are both
    'pending' and dated — i.e. the scheduler's own — are capped.
  - Rescheduling, which is an UPDATE.

  The advisory lock is what makes this race-proof rather than just narrowing
  the window: it serialises per user per day, so two concurrent transactions
  can't both count zero and both insert a full set. Taken before the count,
  released at transaction end.

  ## Verifying

    select scheduled_date, count(*)
    from check_ins
    where user_id = '<your-id>'
    group by scheduled_date
    order by scheduled_date desc
    limit 14;

  From the day after this is applied, no row should exceed check_ins_per_day.
*/

CREATE OR REPLACE FUNCTION enforce_scheduled_checkin_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_day  integer;
  already  integer;
BEGIN
  -- Only the scheduler's own rows. Bonus check-ins arrive as 'completed' with
  -- a null scheduled_date and must never be blocked.
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':' || NEW.scheduled_date::text, 0)
  );

  SELECT check_ins_per_day INTO per_day
  FROM check_in_settings
  WHERE user_id = NEW.user_id;

  -- No settings row means onboarding hasn't finished; nothing to cap against.
  IF per_day IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO already
  FROM check_ins
  WHERE user_id = NEW.user_id
    AND scheduled_date = NEW.scheduled_date;

  IF already >= per_day THEN
    RETURN NULL;  -- skip this row, no error
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_ins_daily_limit ON check_ins;

CREATE TRIGGER check_ins_daily_limit
  BEFORE INSERT ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION enforce_scheduled_checkin_daily_limit();

COMMENT ON FUNCTION enforce_scheduled_checkin_daily_limit() IS
  'Caps scheduler-created check-ins at check_in_settings.check_ins_per_day per user per day. Bonus check-ins (status completed, null scheduled_date) are exempt.';
