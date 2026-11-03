-- Add active_domains column to check_in_settings
ALTER TABLE check_in_settings
ADD COLUMN active_domains text[] NOT NULL DEFAULT '{}';

-- Backfill from quick_checkin_domains for existing users
UPDATE check_in_settings
SET active_domains = quick_checkin_domains
WHERE active_domains = '{}';

-- Deprecate is_full_log (set all to false, but keep column for historical data)
UPDATE check_ins
SET is_full_log = false
WHERE is_full_log = true;

-- Add comment explaining deprecation
COMMENT ON COLUMN check_ins.is_full_log IS 'DEPRECATED: All check-ins now use active_domains. Kept for historical data only.';
