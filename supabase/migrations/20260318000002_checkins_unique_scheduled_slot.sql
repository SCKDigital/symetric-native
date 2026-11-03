-- Prevent duplicate scheduled check-ins for the same user at the same time on the same day.
-- ON CONFLICT DO NOTHING on insert means races fail silently rather than creating duplicates.
alter table check_ins
  add constraint check_ins_user_date_time_unique
  unique (user_id, scheduled_date, scheduled_at);
