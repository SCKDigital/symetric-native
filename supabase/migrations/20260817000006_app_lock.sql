-- Opt-in app lock: require a PIN before showing tracked data after opening
-- the app or returning from background. The PIN itself never leaves the
-- device — only a salted SHA-256 hash is stored, verified client-side via
-- the Web Crypto API. This is a UI gate against casual access (someone
-- picking up an unlocked device), not data encryption.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS app_lock_enabled  boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS app_lock_pin_hash text,
ADD COLUMN IF NOT EXISTS app_lock_pin_salt text;

COMMENT ON COLUMN profiles.app_lock_enabled IS 'Opt-in, off by default. Master toggle for the PIN lock gate in App.tsx.';
COMMENT ON COLUMN profiles.app_lock_pin_hash IS 'SHA-256(salt:pin) hex digest. Null when app_lock_enabled is false.';
COMMENT ON COLUMN profiles.app_lock_pin_salt IS 'Random hex salt generated per PIN, paired with app_lock_pin_hash.';
