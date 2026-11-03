/*
  # Body tracking — alpha (capture only) — August 2026

  Adds physical/body symptom tracking as a separate, once-daily flow alongside
  the existing intraday psych check-ins. Six 0-10 domains (fatigue, pain,
  joint_instability, orthostatic, gut, exertion), pain-site locations on a
  body map, and discrete physical events (subluxation, presyncope, etc).

  ## Design notes
  - Separate tables, not columns on check_ins — body is once-daily, psych is
    intraday, and the cardinalities don't match.
  - All six domain scores are nullable — a partial entry must be saveable.
  - unique (user_id, entry_date) on body_checkins — one row per day, edited in
    place (see edit_count/edited_at below), not appended to.
  - body_events allows multiple rows per day per event_type — these are counts,
    not a single state (e.g. two subluxations in one day are two rows).
  - Pain sites and event sites are separate child tables since events can occur
    without ever having an associated check-in row (body_checkin_id nullable,
    ON DELETE SET NULL — losing the parent check-in must not delete event history).
  - edit_count/edited_at follow the same DB-trigger-owned pattern as check_ins
    and sleep_logs (see 20260327000001_add_edit_tracking.sql): the client only
    ever sets edited_at on UPDATE, the trigger maintains the count.
  - This migration ships fully behind profiles.body_tracking_enabled (default
    false) and touches no existing table's columns or behavior.
*/

-- ── body_checkins ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_checkins (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date             date NOT NULL,
  fatigue                smallint CHECK (fatigue BETWEEN 0 AND 10),
  pain                   smallint CHECK (pain BETWEEN 0 AND 10),
  joint_instability      smallint CHECK (joint_instability BETWEEN 0 AND 10),
  orthostatic            smallint CHECK (orthostatic BETWEEN 0 AND 10),
  gut                    smallint CHECK (gut BETWEEN 0 AND 10),
  exertion               smallint CHECK (exertion BETWEEN 0 AND 10),
  pain_diffuse           boolean NOT NULL DEFAULT false,
  note                   text,
  entered_retroactively  boolean NOT NULL DEFAULT false,
  logged_at              timestamptz NOT NULL DEFAULT now(),
  edit_count             smallint NOT NULL DEFAULT 0,
  edited_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT body_checkins_unique_day UNIQUE (user_id, entry_date)
);

COMMENT ON COLUMN body_checkins.entered_retroactively IS 'True when logged for a date other than today via backfill. Used to detect whether backfilled days skew milder than same-day entries.';
COMMENT ON COLUMN body_checkins.edited_at IS 'Timestamp of most recent edit. Metadata only — not shown to users.';
COMMENT ON COLUMN body_checkins.edit_count IS 'Number of times this entry has been edited. Used for analytics.';

ALTER TABLE body_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "body_checkins_select_own" ON body_checkins FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "body_checkins_insert_own" ON body_checkins FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "body_checkins_update_own" ON body_checkins FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "body_checkins_delete_own" ON body_checkins FOR DELETE USING ((select auth.uid()) = user_id);

CREATE INDEX idx_body_checkins_user_date ON body_checkins(user_id, entry_date);

-- ── body_pain_sites ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_pain_sites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_checkin_id   uuid NOT NULL REFERENCES body_checkins(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region            text NOT NULL,                                   -- e.g. 'knee', 'shoulder', 'ribs'
  side              text CHECK (side IN ('L', 'R')),                 -- null for midline regions
  aspect            text NOT NULL CHECK (aspect IN ('front', 'back')),

  CONSTRAINT body_pain_sites_unique UNIQUE (body_checkin_id, region, side, aspect)
);

COMMENT ON COLUMN body_pain_sites.side IS 'Anatomical (subject''s) side, not viewer''s left/right. Null for midline regions.';

ALTER TABLE body_pain_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "body_pain_sites_select_own" ON body_pain_sites FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "body_pain_sites_insert_own" ON body_pain_sites FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "body_pain_sites_update_own" ON body_pain_sites FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "body_pain_sites_delete_own" ON body_pain_sites FOR DELETE USING ((select auth.uid()) = user_id);

CREATE INDEX idx_body_pain_sites_checkin ON body_pain_sites(body_checkin_id);

-- ── body_events ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date             date NOT NULL,
  event_type             text NOT NULL CHECK (event_type IN
                           ('subluxation', 'presyncope', 'migraine_onset', 'crash_onset', 'reaction', 'injury')),
  body_checkin_id        uuid REFERENCES body_checkins(id) ON DELETE SET NULL,
  entered_retroactively  boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE body_events IS 'Multiple rows per user per day per event_type are allowed — these are counts, not a single daily state.';

ALTER TABLE body_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "body_events_select_own" ON body_events FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "body_events_insert_own" ON body_events FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "body_events_update_own" ON body_events FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "body_events_delete_own" ON body_events FOR DELETE USING ((select auth.uid()) = user_id);

CREATE INDEX idx_body_events_user_date ON body_events(user_id, event_date);

-- ── body_event_sites ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_event_sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_event_id   uuid NOT NULL REFERENCES body_events(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region          text NOT NULL,
  side            text CHECK (side IN ('L', 'R'))
);

ALTER TABLE body_event_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "body_event_sites_select_own" ON body_event_sites FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "body_event_sites_insert_own" ON body_event_sites FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "body_event_sites_update_own" ON body_event_sites FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "body_event_sites_delete_own" ON body_event_sites FOR DELETE USING ((select auth.uid()) = user_id);

CREATE INDEX idx_body_event_sites_event ON body_event_sites(body_event_id);

-- ── edit tracking trigger (reuses the function from 20260327000001) ────────────

CREATE TRIGGER increment_body_checkin_edit_count
  BEFORE UPDATE ON body_checkins
  FOR EACH ROW
  EXECUTE FUNCTION increment_edit_count_on_edit();

-- updated_at maintenance (reuses update_updated_at_column(), defined in 20260316003527_create_full_schema.sql)
CREATE TRIGGER set_body_checkins_updated_at
  BEFORE UPDATE ON body_checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── profiles: body tracking settings ────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS body_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS body_available_from    time NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS body_reminder_time     time NOT NULL DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS body_backfill_days     smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS body_domains_active    text[] NOT NULL DEFAULT
    ARRAY['fatigue', 'pain', 'joint_instability', 'orthostatic', 'gut', 'exertion'];

COMMENT ON COLUMN profiles.body_tracking_enabled IS 'Master toggle for the body-tracking alpha. Off by default — no UI, no queries when false.';
COMMENT ON COLUMN profiles.body_available_from IS 'Local time the Today card starts showing the body check-in. Backfill remains reachable regardless.';
COMMENT ON COLUMN profiles.body_reminder_time IS 'Local time the single daily body-checkin push fires, if that day is not already logged.';
COMMENT ON COLUMN profiles.body_backfill_days IS 'How many days back the body check-in date selector allows, 0-7.';
