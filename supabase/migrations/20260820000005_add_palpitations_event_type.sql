-- Add palpitations to the body_events event_type CHECK constraint.
ALTER TABLE body_events
  DROP CONSTRAINT IF EXISTS body_events_event_type_check;

ALTER TABLE body_events
  ADD CONSTRAINT body_events_event_type_check
  CHECK (event_type IN
    ('subluxation', 'presyncope', 'migraine_onset', 'crash_onset', 'reaction', 'injury', 'palpitations'));
