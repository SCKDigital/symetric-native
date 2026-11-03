/*
  # Let people choose their own morning check-in domains

  ## Why

  The morning check-in has asked three fixed questions since it shipped —
  fatigue, pain, dizziness — chosen for speed rather than because those are the
  three that differ on waking. They are not. Morning stiffness is a recognised
  clinical feature of inflammatory arthritis, and joint_instability is the
  domain closest to it, yet it could not be asked. Gut on waking, brain fog on
  waking and breathlessness on waking are all real and all unavailable.

  A fixed list also cannot be right for a population this varied. The whole
  premise of the evening check-in is that the person picks what they track; the
  morning one contradicted it.

  ## Why a cap rather than a free-for-all

  profiles.body_morning_domains is capped at four by the UI, deliberately. The
  morning form is answered by someone newly awake and often in a flare, and the
  reason it was kept to three was sound even if the particular three were not.
  The constraint people accept is "pick your few", not "we picked for you".

  ## The pain column

  MORNING_BODY_DOMAIN_ORDER still listed `pain`, which was deprecated on
  2026-08-20 when it split into pain_mechanical and pain_widespread. So the
  morning form kept writing morning_pain while everything that reads pain
  looked for morning_pain_mechanical — a column that did not exist. Since the
  split, morning pain has been collected and read by nothing: not the
  drill-down, not dailyBodyValue, not the correlations.

  No backfill for it. Pre-split morning_pain is a combined number and stays
  readable under the deprecated `pain` domain, exactly as evening pain does;
  copying it into morning_pain_mechanical would assert something the reading
  never said. Post-split rows are the same combined question asked in error —
  left in place rather than deleted, since they are still the person's own
  answers about their own mornings.

  ## Shape

  One column per morning-capable domain, matching what body_checkins already
  does for the evening. A readings child table would normalise this properly
  but would rewrite every entry[domain] read in detection, History and the
  report for no gain.

  Not morning-capable, and so given no column: `exhaustion` (eveningOnly — it
  is the end-of-day wrap-up question and means nothing at 8am) and `pain`
  (deprecated).

  ## Verifying

    select body_morning_domains, count(*)
    from profiles where body_morning_enabled group by 1;
*/

-- ── Readings ────────────────────────────────────────────────────────────────

ALTER TABLE body_checkins
  ADD COLUMN IF NOT EXISTS morning_pain_mechanical   smallint CHECK (morning_pain_mechanical   BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS morning_pain_widespread   smallint CHECK (morning_pain_widespread   BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS morning_joint_instability smallint CHECK (morning_joint_instability BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS morning_breathlessness    smallint CHECK (morning_breathlessness    BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS morning_gut               smallint CHECK (morning_gut               BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS morning_brain_fog         smallint CHECK (morning_brain_fog         BETWEEN 0 AND 10);

COMMENT ON COLUMN body_checkins.morning_pain_mechanical IS
  'Morning reading for pain_mechanical. Never merged with the evening column — waking stiff and hurting at 9pm are two measurements, and averaging them is how a morning-only pattern disappears.';

-- ── Which ones to ask ───────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS body_morning_domains text[] NOT NULL DEFAULT '{fatigue,pain_mechanical,orthostatic}';

COMMENT ON COLUMN profiles.body_morning_domains IS
  'Domains the optional morning check-in asks about. Capped at 4 by the UI and intersected at read time with body_domains_active — a morning series earns its place by contrasting with an evening one. Default matches the old fixed three, with pain_mechanical in place of the deprecated combined pain.';
