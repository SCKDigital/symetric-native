-- Eighth body domain: brain fog. Cognitive rather than physical, but it sits
-- with the body domains because it's tracked the same way — one 0-10 severity
-- per day, morning and/or evening — and because the mind domains
-- (concentration in particular) ask a different question: how easy is it to
-- focus, versus how clouded does thinking feel. They can move independently.
--
-- Column name matches the domain key exactly, which detection/bodyDailyValue.ts
-- depends on: it reads entry[domain] and entry[`morning_${domain}`].
-- No morning_brain_fog column — the optional morning check-in is a fixed
-- three-question form (MORNING_BODY_DOMAIN_ORDER: fatigue, pain, orthostatic)
-- and brain fog is not part of it, so dailyBodyValue will simply find the
-- evening reading alone, exactly as it does for gut and breathlessness.

ALTER TABLE body_checkins
ADD COLUMN IF NOT EXISTS brain_fog smallint CHECK (brain_fog BETWEEN 0 AND 10);

-- Appended to the default so new users get it offered. Existing users keep
-- whatever they have selected; brain fog shows as an unselected pill in
-- Settings until they turn it on, which is the same way breathlessness and
-- the split pain domains were introduced.
ALTER TABLE profiles
ALTER COLUMN body_domains_active SET DEFAULT
  ARRAY['fatigue', 'pain', 'joint_instability', 'orthostatic', 'gut', 'exertion', 'exhaustion',
        'pain_mechanical', 'pain_widespread', 'breathlessness', 'brain_fog'];

COMMENT ON COLUMN body_checkins.brain_fog IS 'Evening brain fog severity, 0-10. Higher is worse, like every body domain (see lib/domainPolarity.ts).';
