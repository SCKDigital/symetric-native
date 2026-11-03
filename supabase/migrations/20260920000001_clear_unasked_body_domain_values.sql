/*
  # Clear the readings nobody was asked for

  ## Why

  The native evening body check-in saved a value for every domain in the app,
  not for the domains it had actually put on screen:

    for (const d of CHECKIN_BODY_DOMAIN_ORDER) {
      payload[d] = values[d] ?? domainBaselines[d] ?? 5;
    }

  while the sliders themselves rendered from `activeDomains` — the person's
  body_domains_active. The fallback chain is the part that did the damage. A
  domain someone has turned off has no history for rollingBodyBaseline to work
  from, so it returns its FALLBACK_BASELINE of 5, and the save wrote a 5. Every
  evening. Forever, since after seven such days the rolling median of a column
  full of 5s is also 5.

  Nothing warned anyone, because every read path that could have caught it
  filters on body_domains_active — bodyClusterDetection, bodyMindConnections
  and sleepConnections all intersect with the active list first, so the
  fabricated series never reached Insights. History and the PDF report do not
  filter: BodySection and report/bodySummary both iterate BODY_DOMAIN_ORDER and
  render any column that is non-null, which is correct for their purpose (a
  reading taken under an older set of domains is still a real reading) and is
  what surfaced this. Someone who had never been offered the gut question saw a
  flat gut 5 down their History, and would have carried the same row into a
  report for their doctor.

  The write path is fixed in symetric-native's body-check-in.tsx, which now
  iterates activeDomains and omits the rest from the payload entirely. This
  removes what was already written.

  ## One account, on purpose

  Scoped to d5ae4dfe-b4fb-4bfc-a8dc-9b964d96c373, who reported it. Not an
  oversight: every other affected account is left for a separate decision,
  because clearing someone's health data is not something to do to people in
  bulk on the strength of one report.

  ## Gut, unconditionally

  This account's gut column held seven readings: a 0, a 1, and five 5s. The
  five 5s are the bug. The 0 and the 1 are not — something moved that slider
  once, whether in a test, during an early session, or in a spell where the
  domain was switched on. That mixture is exactly the case the rule below
  refuses to decide on its own, and the account holder decided it: they have
  never tracked gut deliberately, do not intend to, and asked for the column
  emptied. So gut goes in full, the two real readings included, on the explicit
  instruction of the person whose readings they are.

  ## Everything else: the rule that needs no decision

  For the remaining domains this account has switched off, only a series that
  is *entirely* 5s is cleared automatically. Both halves of that matter:

  - Currently off — an active domain's untouched-slider value is a deliberate
    design decision (store the rolling baseline, i.e. "typical for me", rather
    than a flat 5) and is not what this is about.
  - Every value exactly 5, with no exceptions. A domain that was logged
    properly and later turned off has variation in its column, and keeps all of
    it, including the post-deactivation values this bug invented — those are
    indistinguishable from real ones, because for that column the bug wrote the
    median of genuine readings rather than the fallback.

  An all-5s column for a domain that is off holds nothing anyone typed: either
  the bug wrote it, or the untouched-slider rule did before the domain was
  switched off. Neither is the person's answer, so no judgement is involved.

  A domain that is off but has variation is reported by name in the apply log,
  with its range, rather than passed over in silence — the way gut was, so that
  it could be decided rather than guessed at.

  ## Scope

  Evening columns only. The morning check-in has always written only the
  domains it asked (`for (const d of morningDomains)`), so morning_* is clean
  and is left untouched.

  `exhaustion` is excluded because it is `required` in BODY_DOMAINS: it is
  absent from the Settings toggle list and always included in the check-in form
  regardless of body_domains_active. It is never unasked, so this bug could not
  reach it. It is not deprecated — "End of day exhaustion" IS its label, and it
  is a separate question from `fatigue` ("Fatigue across the day"): the whole
  day's heaviness versus the state at the moment of logging.

  `pain` is the deprecated one, split into pain_mechanical and pain_widespread
  on 2026-08-20. The form stopped writing it then, so anything in that column
  predates this bug's reach and is real pre-split data.

  A profile with an empty body_domains_active would be skipped rather than
  treated as "nothing active" — the app reads empty as "use the full default
  list" (see BodyCheckIn's `profile?.body_domains_active?.length ? ... : ...`),
  so for such a person every domain was genuinely on screen.

  ## After

    select 'gut' as domain, c.gut as value, count(*)
    from body_checkins c
    where c.user_id = 'd5ae4dfe-b4fb-4bfc-a8dc-9b964d96c373' and c.gut is not null
    group by 1, 2;

  Zero rows. Those History rows and report lines are gone. Nothing needs
  recomputing: no detector ever read these values, so no stored cluster,
  connection or finding was derived from them.
*/

-- Wrapped so the apply log records what went, per domain. Afterwards the
-- counts are all zero either way and there would be no telling a no-op from a
-- real cleanup.
DO $$
DECLARE
  target  uuid := 'd5ae4dfe-b4fb-4bfc-a8dc-9b964d96c373';
  -- Emptied whatever it holds, on the account holder's explicit instruction —
  -- see "Gut, unconditionally" above. Everything else has to earn it.
  forced  text[] := ARRAY['gut'];
  active  text[];
  d       text;
  present integer;
  lo      integer;
  hi      integer;
  cleared integer;
  total   integer := 0;
BEGIN
  SELECT body_domains_active INTO active FROM profiles WHERE id = target;

  IF active IS NULL THEN
    RAISE EXCEPTION 'no profile for %', target;
  END IF;

  IF cardinality(active) = 0 THEN
    RAISE NOTICE 'body_domains_active is empty, which the app reads as "all domains active" — nothing here was unasked. Stopping.';
    RETURN;
  END IF;

  FOREACH d IN ARRAY ARRAY[
    'fatigue', 'pain_mechanical', 'pain_widespread', 'joint_instability',
    'breathlessness', 'orthostatic', 'gut', 'brain_fog'
  ] LOOP
    -- A domain that is still switched on is left alone even if it is in
    -- `forced`: its slider is on screen every evening, so emptying it would be
    -- deleting answers the form is still asking for.
    CONTINUE WHEN d = ANY (active);

    EXECUTE format(
      'SELECT count(%1$I), min(%1$I), max(%1$I) FROM body_checkins WHERE user_id = $1',
      d
    ) INTO present, lo, hi USING target;

    CONTINUE WHEN present = 0;

    IF (lo = 5 AND hi = 5) OR d = ANY (forced) THEN
      EXECUTE format(
        'UPDATE body_checkins SET %1$I = NULL WHERE user_id = $1 AND %1$I IS NOT NULL',
        d
      ) USING target;
      GET DIAGNOSTICS cleared = ROW_COUNT;
      total := total + cleared;
      IF NOT (lo = 5 AND hi = 5) THEN
        RAISE NOTICE 'body_checkins.%: cleared % reading(s) ranging %..% on request — not all of them came from the bug', d, cleared, lo, hi;
      ELSE
        RAISE NOTICE 'body_checkins.%: cleared % fabricated reading(s)', d, cleared;
      END IF;
    ELSE
      RAISE NOTICE 'body_checkins.%: LEFT ALONE — % reading(s) ranging %..%, so this domain was answered for real at some point. Decide on it by hand.',
        d, present, lo, hi;
    END IF;
  END LOOP;

  RAISE NOTICE 'body_checkins: % reading(s) cleared in total for %', total, target;
END $$;
