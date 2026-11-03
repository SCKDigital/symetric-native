-- The "This week" History view has been removed, leaving only Timeline and
-- Calendar. The Settings-configurable default-view preference this column
-- backed no longer has a UI, so drop it rather than leave dead state behind.

ALTER TABLE profiles DROP COLUMN IF EXISTS history_default_view;
