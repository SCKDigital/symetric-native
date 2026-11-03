-- ── Push subscriptions table ──────────────────────────────────────────────────
-- Stores Web Push Protocol subscription credentials per user.
-- Created here in case it was previously created manually; IF NOT EXISTS is safe.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_owner'
  ) THEN
    CREATE POLICY push_subscriptions_owner ON push_subscriptions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role bypasses RLS (needed for Edge Function to send pushes)
-- No additional policy needed — service role key skips RLS by default.


-- ── pg_cron: trigger send-notifications every 2 minutes ──────────────────────
--
-- IMPORTANT: Before running this migration, replace the two placeholders below:
--
--   YOUR_PROJECT_REF   → find in Supabase Dashboard → Settings → General
--                        (e.g. "abcdefghijklmnop")
--
--   YOUR_SERVICE_ROLE_KEY → Supabase Dashboard → Settings → API → service_role key
--
-- After editing, run this block in the Supabase SQL Editor.
-- pg_net and pg_cron are enabled on all Supabase hosted projects.

-- SELECT cron.schedule(
--   'send-push-notifications',           -- job name (must be unique)
--   '@every 2 minutes',                  -- every 2 minutes — written this way, not
--                                         -- as a literal cron string, so this
--                                         -- disabled block can't contain a `*/`
--                                         -- that closes early if ever re-wrapped
--                                         -- in a /* */ comment. Use '*/2 * * * *'
--                                         -- as the actual value when you run this.
--   $$
--   SELECT net.http_post(
--     url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );

-- To verify the job was created:
-- SELECT * FROM cron.job WHERE jobname = 'send-push-notifications';

-- To remove it later:
-- SELECT cron.unschedule('send-push-notifications');
