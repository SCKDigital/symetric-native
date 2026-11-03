-- Optional descriptive character tags for body_events, for event types that
-- want a "what did it feel like?" prompt (currently just 'reaction') rather
-- than a body-site prompt. Same descriptive, non-scored intent as
-- body_checkins.pain_character / breathlessness_character.
ALTER TABLE body_events
  ADD COLUMN character text[];
