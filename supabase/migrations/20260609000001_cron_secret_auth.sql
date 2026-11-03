-- ⚠ DO NOT RUN THIS AGAINST PRODUCTION.
-- The placeholder below was never substituted. Production's cron jobs were set
-- up by hand and are working; re-running this would overwrite one of them with
-- a broken token. See supabase/CRON.md for the four jobs that actually exist.

-- Migration: 20260609000001_cron_secret_auth.sql
--
-- Updates the schedule-daily-checkins pg_cron job to send a CRON_SECRET
-- instead of the service role key. The edge function now validates this token.
--
-- SETUP INSTRUCTIONS
-- ==================
-- 1. Generate a random secret (e.g. in terminal):
--      openssl rand -base64 32
--
-- 2. Add it to Supabase Edge Function secrets:
--    Dashboard → Settings → Edge Functions → Add secret
--    Name: CRON_SECRET
--    Value: <your generated secret>
--
-- 3. Replace YOUR_CRON_SECRET_HERE below with the same value.
--
-- 4. Run this migration:
--    supabase db push
--    or paste into the Supabase SQL Editor.
--
-- The edge function accepts CRON_SECRET if set, otherwise falls back to
-- the service role key — so the old job keeps working until this migration runs.

select cron.unschedule('schedule-daily-checkins')
where exists (
  select 1 from cron.job where jobname = 'schedule-daily-checkins'
);

select cron.schedule(
  'schedule-daily-checkins',
  '0 * * * *',
  $$
  select
    net.http_post(
      url     := 'https://ovfnewvetuimfqitswdk.supabase.co/functions/v1/schedule-daily-checkins',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET_HERE'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
