# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# The database and edge functions are in `supabase/`

This app talks to Supabase project `ovfnewvetuimfqitswdk`. Its backend moved
here on 2026-11-03 from the old web app's repo (now archived, never pushed):

- migrations — `supabase/migrations/` (in date order). **Adding a column means
  writing a migration here.**
- edge functions — `supabase/functions/` (`send-notifications`, `send-push`,
  `schedule-daily-checkins`, `send-test-notification`, `record-consent`,
  `delete-account`, `site-forms`). Committing doesn't ship them:
  `supabase functions deploy <name>` does.
- the Supabase CLI is linked from this directory (`supabase/.temp`, gitignored)
- detection methodology — `docs/methodology.md`, written against the old web
  app's `src/lib/`, which this app's detectors were ported from

The four production pg_cron jobs are hand-managed and described by no
migration. See `supabase/CRON.md`; never infer the schedule from the
migration files.

# Store listings are in `store/`

App Store screenshots (`store/app-store-screenshots/`, built by
`build-artboards.mjs` from this app's screens) and the Play Store copy.

# The website demo is this app, built for web

`npm run build:demo` builds an interactive copy of the app for the marketing
site, on Aisha's sample data in memory (`EXPO_PUBLIC_DEMO=1`, deployed by
`vercel.json`). Its data comes from the sample-report build, so rebuilding
the report changes `src/lib/demo/aisha-tables.json`. Commit the two together.
Before touching `src/lib/demo/`, `IS_DEMO`, or the detection scheduler's
AsyncStorage keys, read `docs/web-demo.md`.
