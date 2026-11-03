-- ⚠ DO NOT RUN THIS AGAINST PRODUCTION.
-- The placeholder below was never substituted. Production's cron jobs were set
-- up by hand and are working; re-running this would overwrite one of them with
-- a broken token. See supabase/CRON.md for the four jobs that actually exist.

-- Migration: 20260318000001_schedule_daily_checkins_cron.sql
--
-- Sets up an hourly pg_cron job that triggers the schedule-daily-checkins
-- Edge Function. Running hourly (rather than once daily at midnight) is the
-- correct approach for a multi-timezone user base: each user's "start of day"
-- arrives at a different UTC time, so the function needs to run continuously
-- and skip users whose day is already scheduled.
--
-- The function itself is fully idempotent: it checks for existing check_ins
-- rows on the user's local scheduled_date before inserting anything.
--
-- SETUP INSTRUCTIONS
-- ==================
-- 1. Replace YOUR_PROJECT_REF below with your Supabase project ref
--    (the subdomain from your project URL: https://YOUR_PROJECT_REF.supabase.co)
--
-- 2. Replace YOUR_SERVICE_ROLE_KEY below with your service role key
--    (Supabase Dashboard → Settings → API → service_role key)
--
-- 3. Run this migration via the Supabase Dashboard SQL editor or CLI:
--    supabase db push
--
-- 4. Verify the cron job was registered:
--    SELECT * FROM cron.job;
--
-- 5. To test immediately without waiting for the next hour:
--    SELECT cron.schedule_in_database(
--      'schedule-daily-checkins',
--      '* * * * *',  -- temporarily run every minute
--      ...
--    );
--    -- Then restore to hourly after confirming it works.
--
-- NOTE: pg_cron must be enabled on your Supabase project. It is available on
-- Pro and above. If on Free tier, trigger the function manually or via an
-- external cron service (e.g. GitHub Actions, Render cron job) that POSTs to:
-- https://ovfnewvetuimfqitswdk.supabase.co/functions/v1/schedule-daily-checkins
-- with Authorization: Bearer YOUR_SERVICE_ROLE_KEY

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron with schema extensions;

-- Grant usage so the cron job can fire
grant usage on schema cron to postgres;

-- Remove any existing version of this job to allow re-running the migration
select cron.unschedule('schedule-daily-checkins')
where exists (
  select 1 from cron.job where jobname = 'schedule-daily-checkins'
);

-- Schedule the job: runs at the top of every hour
-- Adjust the cron expression if you want a different cadence,
-- e.g. '*/30 * * * *' for every 30 minutes (more responsive but higher cold-start cost)
select cron.schedule(
  'schedule-daily-checkins',
  '0 * * * *',  -- every hour, on the hour
  $$
  select
    net.http_post(
      url     := 'https://ovfnewvetuimfqitswdk.supabase.co/functions/v1/schedule-daily-checkins',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
