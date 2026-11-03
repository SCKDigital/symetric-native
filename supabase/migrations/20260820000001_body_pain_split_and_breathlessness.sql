/*
  # Body domain expansion — pain split, breathlessness, character tags — August 2026

  ## Design notes

  - `pain` is deprecated, not renamed or repurposed. Its recorded meaning —
    "everything that hurt, wherever it was" — is neither of the two domains
    that replace it, so rewriting history to mean something it didn't would
    be worse than leaving a gap. The column is kept, still readable (History
    renders pre-boundary days from it), and simply never written to again.
    Boundary date: 2026-08-20 (see PAIN_SPLIT_BOUNDARY_DATE in
    src/lib/body/constants.ts). Any future detection work must treat
    pre-boundary and post-boundary pain as separate series and must not
    concatenate them — mechanical and widespread pain often move in opposite
    directions, which is exactly the signal the split exists to preserve.
  - `pain_mechanical` / `pain_widespread` are the replacement domains.
    Mechanical tracks activity/instability-linked joint and muscle pain;
    widespread tracks sleep/stress/cycle-linked nerve-type pain. Collapsed
    into one number (the old `pain` column) they average each other out.
  - `breathlessness` is new: dysautonomia, MCAS, rib/chest-wall involvement,
    and deconditioning all present through it, and it's scored separately
    from `anxiety` on the mind check-in so breathlessness-without-anxiety
    stays visible.
  - `pain_character` / `breathlessness_character` are descriptive tag arrays,
    not scores. They exist so a phrase like "burning, electric, skin painful
    to touch" is captured verbatim rather than lost in a single number. The
    vocabulary is validated in src/lib/body/constants.ts and at the write
    path, not with a CHECK constraint here, since the vocabulary is expected
    to change and a DB constraint would need a migration every time it does.
  - All new smallint domains are nullable, same as every other body domain —
    a partial entry must be saveable.
  - body_domains_active default is updated so new signups get all three new
    domains on by default, and existing profiles are backfilled the same way
    (unlike the exhaustion domain, which sidestepped a backfill by being
    required — these three are optional/toggleable, so without a backfill
    existing users would never see them until manually opting in via
    Settings).
  - No RLS changes — these are new columns on body_checkins, which already
    has row-level (not column-level) policies from 20260813000001, so they
    apply automatically.
*/

-- ── body_checkins: new domains + character tags ─────────────────────────────────

ALTER TABLE body_checkins
  ADD COLUMN IF NOT EXISTS pain_mechanical smallint CHECK (pain_mechanical BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS pain_widespread smallint CHECK (pain_widespread BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS breathlessness  smallint CHECK (breathlessness BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS pain_character           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS breathlessness_character text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN body_checkins.pain IS 'Deprecated 2026-08-20 — superseded by pain_mechanical and pain_widespread (see PAIN_SPLIT_BOUNDARY_DATE in src/lib/body/constants.ts). No longer written to by the check-in form. Values recorded before the boundary date mix mechanical and widespread pain into one number; kept read-only so History can still render those pre-boundary days. Must not be concatenated with pain_mechanical/pain_widespread in any future detection work — they measure different things and often move in opposite directions.';
COMMENT ON COLUMN body_checkins.pain_mechanical IS 'Joint and muscle pain — activity, instability, and subluxation-linked. Half of the pain split, see body_checkins.pain comment.';
COMMENT ON COLUMN body_checkins.pain_widespread IS 'Widespread/nerve-type pain — sleep, stress, and cycle-linked, often moves opposite to pain_mechanical. Half of the pain split, see body_checkins.pain comment.';
COMMENT ON COLUMN body_checkins.breathlessness IS 'Air hunger, breathless on effort, or a tight chest. Scored separately from the mind check-in''s anxiety domain so breathlessness-without-anxiety stays visible. TODO: rising breathlessness should generate a high-priority Prepare appointment question — deferred, capture only for now, no in-app triage.';
COMMENT ON COLUMN body_checkins.pain_character IS 'Descriptive tags only (e.g. burning, electric, skin sore to touch) — not scored, never enters correlation/pattern logic. Shown only when pain_mechanical or pain_widespread scores above 0. Vocabulary lives in src/lib/body/constants.ts, validated at the write path rather than here since it is expected to change.';
COMMENT ON COLUMN body_checkins.breathlessness_character IS 'Descriptive tags only, same treatment as pain_character. Shown only when breathlessness scores above 0. Vocabulary lives in src/lib/body/constants.ts.';

-- ── profiles: new domains on by default ──────────────────────────────────────────

ALTER TABLE profiles
ALTER COLUMN body_domains_active SET DEFAULT
  ARRAY['fatigue', 'pain', 'joint_instability', 'orthostatic', 'gut', 'exertion', 'exhaustion',
        'pain_mechanical', 'pain_widespread', 'breathlessness'];

-- Backfill existing profiles so the new domains are on by default for
-- existing users too, not just new signups — they're optional/toggleable
-- (not `required`), so without this they'd stay invisible until a user
-- happened to open Settings and turn them on manually.
UPDATE profiles SET body_domains_active = body_domains_active || ARRAY['pain_mechanical']::text[]
  WHERE NOT ('pain_mechanical' = ANY(body_domains_active));
UPDATE profiles SET body_domains_active = body_domains_active || ARRAY['pain_widespread']::text[]
  WHERE NOT ('pain_widespread' = ANY(body_domains_active));
UPDATE profiles SET body_domains_active = body_domains_active || ARRAY['breathlessness']::text[]
  WHERE NOT ('breathlessness' = ANY(body_domains_active));
