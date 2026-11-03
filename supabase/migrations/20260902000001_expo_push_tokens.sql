-- ── Expo push tokens table ─────────────────────────────────────────────────
-- Stores Expo push tokens for the native (symetric-native) app — a separate
-- table from push_subscriptions, deliberately: that table stores Web Push
-- Protocol credentials (endpoint/p256dh/auth) for the web app's service
-- worker, which has no equivalent concept on native. Expo issues one opaque
-- token per device via getExpoPushTokenAsync(), no encryption keys, so this
-- table is purely additive — push_subscriptions and its RLS/triggers are
-- untouched by this migration.

CREATE TABLE IF NOT EXISTS expo_push_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expo_push_tokens_user_id_idx ON expo_push_tokens(user_id);

ALTER TABLE expo_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own tokens (same shape as push_subscriptions_owner)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'expo_push_tokens' AND policyname = 'expo_push_tokens_owner'
  ) THEN
    CREATE POLICY expo_push_tokens_owner ON expo_push_tokens
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role bypasses RLS (needed for send-notifications/send-test-notification
-- to read tokens and for cleanup of DeviceNotRegistered tokens).
-- No additional policy needed — service role key skips RLS by default.

-- Auto-update updated_at on any write (same pattern as push_subscriptions'
-- own trigger from 20260418000002_push_subscriptions_delivery_tracking.sql).
CREATE OR REPLACE FUNCTION update_expo_push_tokens_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expo_push_tokens_updated_at ON expo_push_tokens;
CREATE TRIGGER expo_push_tokens_updated_at
  BEFORE UPDATE ON expo_push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_expo_push_tokens_updated_at();
