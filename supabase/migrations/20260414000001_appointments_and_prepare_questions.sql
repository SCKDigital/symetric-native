-- ── Appointments ──────────────────────────────────────────────────────────────
-- Tracks upcoming and past clinical appointments for preparation workflow

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  focus_areas TEXT[], -- optional domain names or free-text topics
  notes TEXT, -- post-appointment notes
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: users can only access their own appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_select_own" ON appointments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "appointments_insert_own" ON appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "appointments_update_own" ON appointments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "appointments_delete_own" ON appointments
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_appointments_updated_at();

-- Index for fast lookup of upcoming appointments
CREATE INDEX IF NOT EXISTS appointments_user_date_idx
  ON appointments(user_id, appointment_date DESC);


-- ── Prepare questions ─────────────────────────────────────────────────────────
-- Questions for a specific appointment — auto-generated or user-created

CREATE TABLE IF NOT EXISTS prepare_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  source_pattern_id UUID REFERENCES detected_clusters(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_addressed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: users can only access their own questions
ALTER TABLE prepare_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prepare_questions_select_own" ON prepare_questions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "prepare_questions_insert_own" ON prepare_questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prepare_questions_update_own" ON prepare_questions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "prepare_questions_delete_own" ON prepare_questions
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_prepare_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prepare_questions_updated_at
  BEFORE UPDATE ON prepare_questions
  FOR EACH ROW EXECUTE FUNCTION update_prepare_questions_updated_at();

-- Index for fast lookup by appointment
CREATE INDEX IF NOT EXISTS prepare_questions_appointment_idx
  ON prepare_questions(appointment_id, sort_order);

CREATE INDEX IF NOT EXISTS prepare_questions_user_idx
  ON prepare_questions(user_id);


-- ── Pattern reviews for appointments ─────────────────────────────────────────
-- Tracks which patterns are flagged to discuss and any user notes per appointment

CREATE TABLE IF NOT EXISTS prepare_pattern_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  pattern_id UUID NOT NULL REFERENCES detected_clusters(id) ON DELETE CASCADE,
  should_discuss BOOLEAN NOT NULL DEFAULT TRUE,
  user_note TEXT,
  was_discussed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(appointment_id, pattern_id)
);

-- RLS
ALTER TABLE prepare_pattern_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prepare_pattern_reviews_select_own" ON prepare_pattern_reviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "prepare_pattern_reviews_insert_own" ON prepare_pattern_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prepare_pattern_reviews_update_own" ON prepare_pattern_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "prepare_pattern_reviews_delete_own" ON prepare_pattern_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_prepare_pattern_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prepare_pattern_reviews_updated_at
  BEFORE UPDATE ON prepare_pattern_reviews
  FOR EACH ROW EXECUTE FUNCTION update_prepare_pattern_reviews_updated_at();

CREATE INDEX IF NOT EXISTS prepare_pattern_reviews_appointment_idx
  ON prepare_pattern_reviews(appointment_id);
