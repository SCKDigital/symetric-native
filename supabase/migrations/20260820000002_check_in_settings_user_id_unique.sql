-- check_in_settings never got its UNIQUE(user_id) constraint applied to the
-- live database. The table predates migration tracking, and the retroactive
-- baseline in 20260316003527_create_full_schema.sql used
-- `CREATE TABLE IF NOT EXISTS`, which is a no-op against a table that already
-- exists and can't add a constraint the live table is missing. This breaks
-- MindSetup.tsx's `.upsert(..., { onConflict: 'user_id' })` with "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification".

-- Defensive: collapse any duplicate rows per user_id (keeping the most
-- recently updated one) before adding the constraint, in case any slipped in
-- while it was unenforced. No code path inserts a second row for the same
-- user today, but this makes the migration safe to run regardless.
DELETE FROM check_in_settings a
USING check_in_settings b
WHERE a.user_id = b.user_id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_in_settings_user_id_key'
  ) THEN
    ALTER TABLE check_in_settings ADD CONSTRAINT check_in_settings_user_id_key UNIQUE (user_id);
  END IF;
END $$;
