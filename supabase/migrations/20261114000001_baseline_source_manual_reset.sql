-- baselines.source is the enum baseline_source in production, not the text
-- column 20260316003527_create_full_schema.sql describes. The enum had only
-- 'onboarding' and 'rolling_median', so every baseline the app wrote as
-- 'manual_reset' was rejected:
--   - Settings, turning on a domain that never had a baseline (settings.tsx)
--   - Settings > Reset baselines (data-sheets.tsx)
-- The onboarding domains card wrote 'default' and has been changed to
-- 'onboarding' rather than adding a value.
--
-- Nothing reads source to decide anything; it is history.

ALTER TYPE baseline_source ADD VALUE IF NOT EXISTS 'manual_reset';
