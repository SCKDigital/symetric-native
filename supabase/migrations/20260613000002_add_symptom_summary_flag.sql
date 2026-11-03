-- ── WP4: symptom_summary_enabled flag ────────────────────────────────────────
-- Adds a per-user opt-in for the symptom descriptor summary in the PDF report.
-- Off by default — requires product/clinical sign-off before enabling for users.
-- See WP4 in the implementation spec.

alter table profiles
  add column if not exists symptom_summary_enabled boolean not null default false;
