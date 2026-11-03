-- Rename milestone_type '30_days' to 'circadian_available'.
-- The key was written by the old check30DayMilestone implementation before this
-- milestone was formally named. Also handles 'checkins_30' if written during
-- early development.
UPDATE milestones_achieved
SET milestone_type = 'circadian_available'
WHERE milestone_type = '30_days';

UPDATE milestones_achieved
SET milestone_type = 'circadian_available'
WHERE milestone_type = 'checkins_30';
