-- Atomic check-and-insert for daily check-in scheduling.
--
-- Uses a transaction-level advisory lock keyed on (user_id, scheduled_date) so
-- that if the client-side scheduler and the edge function race to create the
-- same user's check-ins, only the first caller wins — the second returns
-- skipped=true without inserting anything.
--
-- Callers pass only the per-row timestamps; user_id, scheduled_date,
-- is_full_log, and status are supplied as top-level parameters or constants.

CREATE OR REPLACE FUNCTION schedule_checkins_for_user(
  p_user_id        uuid,
  p_scheduled_date date,
  p_rows           jsonb  -- [{scheduled_at: ISO, expires_at: ISO}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing  int;
  v_inserted  int;
  v_lock_key  bigint;
BEGIN
  -- Derive a stable 64-bit lock key from the (user_id, date) pair.
  v_lock_key := ('x' || substr(md5(p_user_id::text || p_scheduled_date::text), 1, 16))::bit(64)::bigint;

  -- Acquire a transaction-scoped advisory lock; blocks until acquired.
  -- Released automatically at end of transaction.
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Re-check inside the lock to handle TOCTOU races.
  SELECT COUNT(*) INTO v_existing
  FROM check_ins
  WHERE user_id = p_user_id AND scheduled_date = p_scheduled_date;

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'skipped', true);
  END IF;

  -- Insert all rows from the jsonb payload.
  WITH ins AS (
    INSERT INTO check_ins (user_id, scheduled_at, scheduled_date, expires_at, is_full_log, status)
    SELECT
      p_user_id,
      (row_data->>'scheduled_at')::timestamptz,
      p_scheduled_date,
      (row_data->>'expires_at')::timestamptz,
      false,
      'pending'
    FROM jsonb_array_elements(p_rows) AS row_data
    ON CONFLICT (user_id, scheduled_date, scheduled_at) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', false);
END;
$$;

-- Grant to authenticated (client-side calls) and service_role (edge function).
GRANT EXECUTE ON FUNCTION schedule_checkins_for_user(uuid, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION schedule_checkins_for_user(uuid, date, jsonb) TO service_role;
