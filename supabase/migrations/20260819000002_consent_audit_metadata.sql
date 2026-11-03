-- Server-observed metadata for the onboarding consent event, captured by the
-- record-consent edge function (never trusted from the client) alongside the
-- existing mind/body/cycle consent timestamps. Strengthens the audit trail
-- for the age/consent gate without adding any UI friction — no signature step,
-- just IP + user agent recorded at the same moment the consent is written.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS consent_ip_address text,
ADD COLUMN IF NOT EXISTS consent_user_agent text;

COMMENT ON COLUMN profiles.consent_ip_address IS 'Client IP observed by the record-consent edge function at onboarding completion. Covers the age/mind/body/cycle consents, which are all submitted in the same request.';
COMMENT ON COLUMN profiles.consent_user_agent IS 'User-Agent header observed by the record-consent edge function at onboarding completion.';
