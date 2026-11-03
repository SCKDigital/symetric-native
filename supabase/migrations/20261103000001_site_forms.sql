/*
  # Somewhere for the marketing site's forms to land

  ## Why

  symetric.app has two forms, the waitlist at the foot of the homepage and the
  contact form on /support, and both posted to "#": every submission was
  thrown away. The site is static, with no server routes, so they now post to
  the site-forms edge function, which writes here.

  ## waitlist

  One row per address, lower-cased by the function before insert so the
  unique constraint catches "Me@x.com" and "me@x.com". Re-joining is not an
  error, the function ignores the conflict.

  ## contact_messages

  Kept even though the function also emails each one to support@, so a
  message survives a failed send. `notified` records whether that email went.

  ## Access

  RLS on with no policies, and nothing granted to anon or authenticated:
  only the service role (the function) can read or write either table. These
  are visitors to the website, not app users, and hold no health data.
*/

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (char_length(email) <= 254),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (char_length(email) <= 254),
  reason TEXT NOT NULL CHECK (reason IN ('general', 'support')),
  message TEXT NOT NULL CHECK (char_length(message) <= 5000),
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON waitlist FROM anon, authenticated;
REVOKE ALL ON contact_messages FROM anon, authenticated;
