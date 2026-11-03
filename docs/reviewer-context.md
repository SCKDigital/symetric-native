# Symetric — Reviewer Context

> **For CodeRabbit and human reviewers.** Explains what this app is, what compliance rules apply, and what to watch for when reviewing diffs. This is not a full product spec — it covers only what a code reviewer needs to judge whether a change is safe.

---

## What is Symetric?

A mental health tracking PWA (React 18 + TypeScript + Vite + Supabase + Tailwind CSS). Users log how they feel across 8 domains (mood, energy, anxiety, concentration, irritability, social battery, sensory sensitivity, motivation) plus sleep quality, typically 2–4 times a day. The app detects patterns over time and generates a PDF report the user can bring to clinical appointments.

**The app is not diagnostic.** It observes patterns and describes them in the user's own terms. It does not name conditions, assign severity ratings, or give clinical guidance. This is a deliberate, non-negotiable design principle — not a scope gap.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend | Supabase (Postgres + RLS + Edge Functions) |
| PDF generation | @react-pdf/renderer |
| Analytics | PostHog (minimal events, no scores/scores surfaced) |
| Push notifications | Web Push (VAPID), delivered by a pg_cron-triggered Edge Function |
| Test runner | Vitest (embedded in vite.config.ts) |
| Linter | ESLint v9 flat config (eslint.config.js) |

---

## Compliance Rules — Non-Negotiable

These rules exist for user safety and trust. A CI lint check enforces some of them; CodeRabbit enforces the rest. Flag violations at HIGH severity.

### 1. No diagnostic or clinical labels
No condition names (ADHD, depression, bipolar disorder, anxiety disorder, OCD, etc.), no "episode" or "disorder" language, no clinical severity framing ("severe", "mild episode") may appear anywhere a user can read — UI copy, push notification strings, PDF report pages, or error messages.

**Allowed:** symptom/observation language — "your mood has been lower than usual", "energy tends to drop after poor sleep".

**Not allowed:** "signs of a depressive episode", "anxiety disorder indicators detected".

### 2. No red/green/traffic-light colours
No red, green, or amber as status indicators. The approved palette:
- **Domains:** `src/utils/domainColors.ts` — indigo/slate base, each domain has a fixed pastel
- **Markers:** `src/utils/markerColors.ts` — amber (medication), teal (therapy), purple (life event), pink (cycle phase)
- **Simplified mode:** single colour `#818CF8` for all domains

### 3. No raw statistical values in the UI
The following are internal-only and must never render in any user-facing component or PDF page:
- `sort_weight` — internal priority weighting on `detected_clusters`
- `strength` — Pearson r-value stored in `domain_connections`
- `high_despite_poor_sleep`, `improved_with_sleep` — internal enrichment flags

Only `direction` ("tends to move together") and qualitative `confidence` ("clear" / "tentative") may be shown. See `ConnectionResult` in `src/lib/detection/computeConnection.ts`.

**Known intentional exception:** `severity_score` is rendered in `ClusterCard.tsx` and `HistoryScreen.tsx` for the `baseline_shift` cluster type only, as "shifted by X points". This is observable shift magnitude in the user's own scale — not a raw internal score label. Do not extend this to other cluster types.

### 4. All user-facing strings in `src/content/copy.ts`
No string literal that a user reads may live in a component file. All headings, button labels, body text, notification copy, and error messages must be imported from `src/content/copy.ts`.

### 5. RLS on every new Supabase table
Every new table needs `ENABLE ROW LEVEL SECURITY` and policies scoped to `user_id = (select auth.uid())`. Use the subquery form `(select auth.uid())` — it is evaluated once per statement, not once per row. See migration `20260609000003_schema_cleanup.sql` for the canonical pattern.

### 6. No gamification
No streaks, badges, point systems, levels, leaderboards, completion percentages as rewards, or any mechanic that ranks or incentivises user behaviour.

### 7. No medication dosage/tracking logic
`intervention_markers` stores context annotations (started/stopped/changed) for medications, therapy, and life events. It must not gain dosage fields, reminder scheduling, drug interactions, or any drug database. `Page5MedicationAnalysis` in the PDF report renders intervention context only.

### 8. No AI/LLM
All pattern detection is deterministic. No calls to OpenAI, Anthropic, or any LLM. Do not add any.

---

## Architecture Notes

### Check-in scheduling: `scheduled_date` vs `scheduled_at`
`check_ins` has two date fields:
- `scheduled_date` — a `date` column storing the **user's local date** (e.g. `2026-06-15`)
- `scheduled_at` — a `timestamptz` storing the **UTC delivery time**

For date-grouping, history display, and gap detection, always use `scheduled_date`. Deriving a date from `scheduled_at` via `new Date(scheduled_at).toLocaleDateString()` is timezone-unsafe.

**Known unfixed instance:** `ClusterCard.tsx` ~line 156 derives a date from `scheduled_at`. Do not widen this pattern.

### WP4: Symptom descriptors (clinical gate)
`src/lib/report/symptomDescriptors.ts` generates clinical-facing descriptors for the PDF report (onset, frequency, duration). This feature is gated on `profiles.symptom_summary_enabled` (default `false`). The comment in `supabase.ts` says "requires clinical sign-off". Never remove this gate or default it to true.

### Sleep score scale
`sleep_logs.score` is a 1–5 integer. A historical bug stored sleep baselines on a 2–9 scale; migration `20260403000001_fix_sleep_baselines.sql` corrected it. Do not reintroduce any sleep scoring logic that uses a scale other than 1–5.

### Baseline `is_current` flag
Each user has multiple baseline rows in the `baselines` table. Only the row with `is_current = true` is the active baseline used for pattern detection. Queries must filter on this flag. Do not accidentally read all baseline rows as if they're equivalent.

### Pattern detection thresholds
`src/lib/detection/computeConnection.ts` and related files contain constants like `MIN_OVERLAP`, `MIN_ABS_R`, `CLEAR_ABS_R`, `MAX_P`. These guard against surfacing weak or spurious correlations to users. Do not lower them without explicit justification documented in the PR.

### Push notification delivery window
`supabase/functions/send-notifications/index.ts` runs every 2 minutes via pg_cron and delivers pushes for check-ins within a ±90-second window of `scheduled_at`. This window is intentionally narrow to avoid duplicate notifications. Do not widen it without understanding the cron cadence.

### PDF report
Generated client-side using `@react-pdf/renderer`. Pages:
- Page 1: Summary
- Page 2: Patterns
- Page 3: Charts
- Page 4: Context (markers, cycle phase, notes)
- Page 5: Medication/intervention analysis (context only, no dosage)

---

## Recently Active Areas (July 2026)

Areas that have seen recent changes and may deserve extra scrutiny:

- **Swipe navigation** — screen-level swipe gesture handler in `App.tsx` / `TodayScreen.tsx` (landed 2026-07-03)
- **Reschedule flow** — replaces clock icon on Today screen; `TodayScreen.tsx`, scheduler logic (landed 2026-07-03)
- **WP1–WP4 correlation features** — `src/lib/detection/computeConnection.ts`, `src/components/insights/ExploreConnectionSheet.tsx`, `PinnedConnectionsSection.tsx`, `src/lib/report/symptomDescriptors.ts` (landed 2026-06-22)
- **Settings restructure** — removed workday mode, midweek simplification, morning reminder, notification sound; migration `20260623000001_drop_removed_feature_columns.sql`
- **Luteal direction** — `src/lib/detection/lutealPatternDetection.ts`, migration `20260609000002_luteal_direction.sql`
- **RLS performance fix** — migration `20260609000003_schema_cleanup.sql` (affects all post-schema tables)
