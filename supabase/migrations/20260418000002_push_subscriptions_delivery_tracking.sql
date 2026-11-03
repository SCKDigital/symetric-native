-- Migration: 20260418000002_push_subscriptions_delivery_tracking.sql
--
-- Adds delivery-tracking columns to push_subscriptions so that:
--   • send-notifications can record per-attempt outcomes
--   • updated_at reflects when the subscription was last verified alive
--   • the dev-only diagnostics panel in Settings can surface staleness and errors
--
-- No RLS changes needed — existing push_subscriptions_owner policy covers all columns.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at               timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_delivery_attempt_at  timestamptz          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_delivery_error       text                 DEFAULT NULL;

-- Back-fill updated_at for existing rows (ADD COLUMN sets them all to now() via DEFAULT;
-- use created_at instead so staleness calculation is meaningful from day one).
UPDATE push_subscriptions
  SET updated_at = created_at
  WHERE updated_at > created_at;  -- only rows whose updated_at was just set by the DEFAULT

-- Auto-update updated_at on any write
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_push_subscriptions_updated_at();
