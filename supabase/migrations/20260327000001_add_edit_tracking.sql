-- Add edit tracking columns to check_ins and sleep_logs.
--
-- edited_at: timestamp of most recent edit — for data integrity/research use,
--            never shown to users (showing edit history creates anxiety).
-- edit_count: number of times a record has been edited — useful for analytics
--             (high edit rates can flag confusing UI elements) and future research.
--
-- A BEFORE UPDATE trigger auto-increments edit_count whenever edited_at changes,
-- so callers only need to set edited_at; the count is maintained by the DB.

-- ── check_ins ────────────────────────────────────────────────────────────────

ALTER TABLE check_ins
  ADD COLUMN edited_at  timestamptz,
  ADD COLUMN edit_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN check_ins.edited_at   IS 'Timestamp of most recent edit. Metadata only — not shown to users.';
COMMENT ON COLUMN check_ins.edit_count  IS 'Number of times this check-in has been edited. Used for analytics.';

-- ── sleep_logs ───────────────────────────────────────────────────────────────

ALTER TABLE sleep_logs
  ADD COLUMN edited_at  timestamptz,
  ADD COLUMN edit_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN sleep_logs.edited_at   IS 'Timestamp of most recent edit. Metadata only — not shown to users.';
COMMENT ON COLUMN sleep_logs.edit_count  IS 'Number of times this sleep log has been edited. Used for analytics.';

-- ── Indexes for edit-window queries ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_check_ins_completed_at
  ON check_ins(completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sleep_logs_created_at
  ON sleep_logs(user_id, created_at);

-- ── Trigger: auto-increment edit_count when edited_at changes ────────────────

CREATE OR REPLACE FUNCTION increment_edit_count_on_edit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.edited_at IS DISTINCT FROM OLD.edited_at AND NEW.edited_at IS NOT NULL THEN
    NEW.edit_count := COALESCE(OLD.edit_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER increment_check_in_edit_count
  BEFORE UPDATE ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION increment_edit_count_on_edit();

CREATE TRIGGER increment_sleep_log_edit_count
  BEFORE UPDATE ON sleep_logs
  FOR EACH ROW
  EXECUTE FUNCTION increment_edit_count_on_edit();
