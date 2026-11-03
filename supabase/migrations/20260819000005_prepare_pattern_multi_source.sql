-- Prepare's pattern review/question list now spans mind (detected_clusters),
-- sleep (sleep_symptom_connections), and cycle (luteal_symptom_patterns)
-- findings, not just detected_clusters. pattern_id / source_pattern_id can no
-- longer be a strict FK to a single table, so we drop that constraint and add
-- a discriminator column recording which table the id actually belongs to.
-- Body has no persisted pattern table yet (no detector exists), so it is not
-- part of this enum — body findings remain display-only in Prepare.

ALTER TABLE prepare_pattern_reviews
  DROP CONSTRAINT IF EXISTS prepare_pattern_reviews_pattern_id_fkey;

ALTER TABLE prepare_pattern_reviews
  ADD COLUMN IF NOT EXISTS pattern_source TEXT NOT NULL DEFAULT 'cluster'
    CHECK (pattern_source IN ('cluster', 'sleep_connection', 'luteal'));

-- The old UNIQUE(appointment_id, pattern_id) assumed one global id space.
-- With multiple source tables, uniqueness needs the source too.
ALTER TABLE prepare_pattern_reviews
  DROP CONSTRAINT IF EXISTS prepare_pattern_reviews_appointment_id_pattern_id_key;

ALTER TABLE prepare_pattern_reviews
  ADD CONSTRAINT prepare_pattern_reviews_appt_pattern_source_key
    UNIQUE (appointment_id, pattern_id, pattern_source);

ALTER TABLE prepare_questions
  DROP CONSTRAINT IF EXISTS prepare_questions_source_pattern_id_fkey;

ALTER TABLE prepare_questions
  ADD COLUMN IF NOT EXISTS source_pattern_source TEXT
    CHECK (source_pattern_source IN ('cluster', 'sleep_connection', 'luteal'));
