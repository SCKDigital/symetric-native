/*
  # Let people choose the accent colour

  ## Why

  Symetric's whole job is to show someone which of their symptoms moved
  together, and it makes that argument in colour. Every chart is a claim about
  *which measurement* you are looking at, so the palette that identifies data
  is load-bearing and is not up for negotiation.

  The chrome is a different matter. What colour the buttons and links are
  carries no information at all, and this app is used daily, often by someone
  who feels bad, often for years. Handing that one piece back costs nothing.
  Comfort mode already establishes that this app lets you turn its volume down;
  this is the same idea with a smaller blast radius.

  ## The three

  'porcelain' (the default), 'teal', 'plum'. Defined in the app, in
  src/constants/accents.ts — deliberately NOT enumerated here.

  ## Why text and not an enum

  Two reasons, and the second is the real one.

  A Postgres enum needs a migration to add a value, and this is a cosmetic
  list that will grow. More importantly, the constraint that matters cannot be
  expressed here: an *older app build* has to survive meeting a value it has
  never heard of. If someone picks a fourth accent on their phone and then
  opens the app on a tablet running last month's build, the tablet must fall
  back to the default rather than render undefined tokens. That fallback lives
  in toAccentName() in the client, and a database-side CHECK would add nothing
  to it while making the next colour a schema change.

  The cost is that a bad write is not rejected. For a presentational field
  whose reader already validates, that is the right trade.

  ## Default

  'porcelain', which is a CHANGE for existing users: the app shipped teal in
  1.4.0 and indigo before that. That is intended — porcelain becomes the
  brand, including the launcher icon and the splash, and anyone who preferred
  the old colour can pick 'teal' and get it back exactly.

  ## Note

  Nothing server-side reads this. No edge function, no cron job, no report.
  It is presentational state that happens to want to follow the user between
  devices, which is the only reason it is in the database at all.

  ## Verifying

    select accent, count(*) from profiles group by 1;

  Every row should be 'porcelain' immediately after this runs.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT 'porcelain';

COMMENT ON COLUMN profiles.accent IS
  'Which accent colour the app wears: porcelain (default), teal or plum. Presentational only; nothing server-side reads it. Deliberately unconstrained text so an older client meeting a newer value falls back in toAccentName() rather than erroring — see src/constants/accents.ts in the native app.';
