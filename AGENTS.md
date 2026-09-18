# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# The database and edge functions are NOT in this repo

This app talks to Supabase project `ovfnewvetuimfqitswdk`, but the schema lives
next door in `mosaic-app/supabase/`:

- migrations — `mosaic-app/supabase/migrations/` (76+ files, in date order)
- edge functions — `mosaic-app/supabase/functions/` (`send-notifications`,
  `schedule-daily-checkins`, `send-push`, `email-report`, `record-consent`)
- the Supabase CLI is linked from that directory, not this one
- detection methodology — `mosaic-app/docs/methodology.md`

`mosaic-app` started as the web app, which is now obsolete. Treat it as the
Supabase repo. **Adding a column means writing a migration there** — do not
start a second migration history in this repo.

The four production pg_cron jobs are hand-managed and described by no
migration. See `mosaic-app/supabase/CRON.md`; never infer the schedule from
the migration files.
