-- Which check-in categories this appointment is about — shown as a Mind/Body
-- bubble selector when setting the appointment, and used to scope what the
-- Prepare report includes by default. Distinct from focus_areas (free-text
-- topics like "Sleep patterns").
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS focus_categories TEXT[] NOT NULL DEFAULT '{mind}';

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_focus_categories_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_focus_categories_check
  CHECK (focus_categories <@ ARRAY['mind', 'body']::TEXT[]);
