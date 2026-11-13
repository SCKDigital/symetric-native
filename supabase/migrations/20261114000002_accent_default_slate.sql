/*
  # Slate becomes the default accent

  A fourth accent, 'slate' — the dark grey the onboarding screens were already
  drawn in — is now the default. Porcelain, teal and plum stay as options.
  Defined in src/constants/accents.ts; the column stays unconstrained text for
  the reasons in 20260921000001_accent_choice.sql.

  The column default has to move with the app's: every profile row is created
  with this default written into it, so leaving it at 'porcelain' would mean
  no new account ever saw slate.

  Existing 'porcelain' rows move to slate too. Porcelain was the column
  default, so nearly all of them were never a choice, and there is no way to
  tell the few that were. Anyone who wants it back picks it in Settings.
  Teal and plum were always deliberate, and are left alone.

  Older builds don't know 'slate' and fall back to their own default in
  toAccentName(), so the new value is safe for them.
*/

ALTER TABLE profiles ALTER COLUMN accent SET DEFAULT 'slate';

UPDATE profiles SET accent = 'slate' WHERE accent = 'porcelain';

COMMENT ON COLUMN profiles.accent IS
  'Which accent colour the app wears: slate (default), porcelain, teal or plum. Presentational only; nothing server-side reads it. Deliberately unconstrained text so an older client meeting a newer value falls back in toAccentName() rather than erroring — see src/constants/accents.ts in the native app.';
