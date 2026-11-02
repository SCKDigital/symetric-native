# Website demo

Last updated 2 November 2026.

An interactive copy of the app for the marketing site. It is this app,
built for the web and running on Aisha's sample data held in memory. It
has no sign-in and makes no network requests, and reloading puts the data back.
It shows the same findings as the sample report the site offers as a PDF,
because it is built from the same data in the same run.

**The code is the source of truth.** This file explains how the pieces fit
and what will quietly break if they're changed carelessly. If the two
disagree, the code is right and this file is stale.

---

## Day to day

| To… | Run (from `symetric-native`) |
|---|---|
| Build the demo | `npm run build:demo` → `dist/demo/` |
| Look at it locally | `npx serve@14.2.4 dist/demo -l 8100`, then open http://localhost:8100/demo |
| Change Aisha, or refresh the data after a detector change | `node scripts/sample-report/build.mjs`, then commit `src/lib/demo/aisha-tables.json` **and** the new PDF together |
| Deploy | Push. Vercel builds from `vercel.json` |

- **Serve without `-s`.** `serve -s` (single-page fallback) answers `/demo`
  with the app's `index.html` instead of the frame page. Expo already exports
  a static HTML file for every route, so the fallback is never needed.
- **`npm run build:demo` works in cmd, PowerShell and bash.** It sets
  `EXPO_PUBLIC_DEMO=1` from a Node script. The inline form,
  `EXPO_PUBLIC_DEMO=1 npx expo ...`, only works in bash.
- **The sample-report build writes the website's PDF by default**, to
  `../mositric-marketing/public/symetric-sample-report.pdf`. To check a change
  without touching that file, pass a different output path as the first argument.

## Hosting (Vercel)

- **The Vercel project** points at `SCKDigital/symetric-native`, root directory
  = repo root. `vercel.json` sets the build command, the output folder
  (`dist/demo`), `cleanUrls`, and long caching for `/_expo/static/`.
  It needs no environment variables, and shouldn't be given any.
- **It must be served from a domain root** (e.g. `demo.symetric.app`), not a
  subpath of the marketing site. Expo's asset paths are absolute (`/_expo/…`),
  and `demo.html` loads the app from `./`.
- **The website embeds `/demo`, not `/`:**
  ```html
  <iframe src="https://demo.symetric.app/demo" title="Try the Symetric app"
          style="width:100%;height:920px;border:0"></iframe>
  ```
  `/` is the bare app, with no frame, start screen or reset. On phones, linking
  to `/demo` works better than embedding it, because the page then runs full screen.

---

## How it fits together

### The switch: `EXPO_PUBLIC_DEMO=1`

`src/lib/supabase.ts` exports `IS_DEMO`. When it's set, `supabase` is the fake
client instead of the real one. Because the value is fixed when the app is
built, an App Store build can never end up in demo mode. Everything else
demo-specific checks `IS_DEMO`:

| Where | What it does in the demo |
|---|---|
| `src/lib/supabase.ts` | Fake client; skips the missing-env-vars check |
| `src/app/_layout.tsx` | Renders `DemoTour` over the tabs |
| `src/components/app-tabs.tsx` | Hides Settings |
| `src/app/insights.tsx` | Opens on 90 days, not 30 |
| `src/lib/prepare-range.ts` | Prepare defaults to 90 days, not 30 |

The 90-day defaults exist because the report covers 90 days, and Aisha's
headline flare is older than 30.

Some changes apply to every web build, not just the demo:

- `src/hooks/use-color-scheme.web.ts` always returns dark. Without that, a
  visitor whose system is in light mode gets the placeholder light palette,
  which shows as a white tab bar.
- The tab bar is 60px tall on web, so the label descenders aren't clipped.
- `src/global.css` maps `'DM Mono'` to monospace fonts already installed on the
  visitor's machine. The app never loads DM Mono (on iOS it falls back to the
  system font, too), so browsers were using serif.

### The fake database: `src/lib/demo/fake-supabase.ts`

Every table is an array in memory. It implements only the query calls the app
actually makes:

- the filters `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is`, `not`, `or`
- `order`, `limit`, `single`, `maybeSingle`, and count-only selects
- `insert`, `update`, `delete`, and `upsert` with `onConflict`
- the three nested selects: `body_pain_sites`, `body_event_sites` and
  `context_tags`. To add another, extend the `EMBEDS` map.

**An unknown filter returns an error naming it, instead of returning every
row.** If a new screen breaks in the demo, check the console for `[demo]`.
That usually means a new query needs adding here.

Auth always reports a signed-in demo user, and `functions.invoke` does nothing.

### The data: Aisha, shared with the sample report

- **Persona and story:** `mosaic-app/docs/demo-profile-aisha.md`. Read it
  before changing anything. She tracks a curated five mind domains, and nothing
  may read as pointing toward a diagnosis.
- **Raw rows:** `scripts/sample-report/aisha-data.ts`.
- **`scripts/sample-report/build.mjs`** runs the app's own detection over them,
  week by week across the 90 days, as a phone would have. It then prints the PDF
  **and** writes `src/lib/demo/aisha-tables.json`: every table, including what
  detection stored. One run produces both, which is what keeps them matching.
- **`src/lib/demo/seed.ts`** loads that JSON:
  - It moves every date forward so the history ends yesterday, using
    `builtFor` in the file.
  - Timestamps are stored as wall-clock time with no time zone, and read back
    in the visitor's zone, so a 9:10am check-in shows at 9:10am anywhere.
  - It fills in the profile and settings columns the app needs but the report
    never did, such as onboarding finished and setup cards answered.
  - It adds today's three pending check-ins, timed relative to now so none
    have already expired.
  - It sets the body check-in to open at `00:00`, so visitors can try it at any hour.

**Vercel only reads the JSON.** It never runs the report generator. Forgetting
to commit the JSON after a rebuild means the demo and the PDF drift apart.

### Why detection doesn't run when the demo opens

The detection results arrive with the data. Running detection again at launch
(as the app normally does) would mean one pass over the whole history as of
now, rather than the weekly replay, and would rewrite the findings so they no
longer matched the report.

So `resetPerUserState()` in `fake-supabase.ts`:

- clears every localStorage key containing the demo user's id. Detection
  stamps, the bonus check-in cooldown and the Prepare range all survive a
  reload otherwise.
- writes the scheduler's "already ran today" stamps (`lastPatternDetection_`,
  `lastConnectionDetection_`, `lastBaselineRecalc_`) in the formats
  `pattern-detection-scheduler.ts` uses.

**If those key names or formats change in the scheduler, update them here,**
or the demo silently re-runs detection and drifts from the report.

Logging a body check-in still forces a detection run, as it does in the app, so
findings can shift after a visitor does that. This is intended.

### The tour: `src/components/demo/demo-tour.tsx`

There is one card per tab, floating above the tab bar. The first visit to a tab
opens its card, and Next goes to the next tab. Touching anything else tucks
the card into a "Tour" pill, because step one asks for a check-in and the card
would otherwise sit on the form's Done button. `ABOVE_TAB_BAR` there must clear
`TAB_BAR_HEIGHT_WEB` in `app-tabs.tsx`.

### The frame: `public/demo.html`

Expo copies `public/` into the root of the export. This page has:

- a phone frame at 390×844, scaled to fit, on screens wider than 520px; and
  the full viewport on phones
- a start screen, so the ~3.7 MB app bundle only loads after "Try the app"
- a "Demo with sample data" bar with Reset, which reloads the iframe and so
  restores the in-memory data

---

## Known differences from the report

- **Counts are one day apart.** Insights' "Last 90 days" ends today, which has
  no data; the report's 90 days end yesterday. So the demo shows e.g. 208
  check-ins against the report's 209.
- **Insights and the report rank the same findings differently,** so their
  headline lists aren't identical. The report's top item is in Insights' Patterns list.
- **Aisha's pattern-review note** ("should discuss" on the flare) is in the
  data, but Prepare doesn't render `PatternReviewSection` yet, so it doesn't
  appear in the app.

## Checking it after a change

Before deploying, open `/demo` locally and walk through it:

1. Start screen → Try the app → Today shows a mind check-in due.
2. Log it (move a slider, Done). Today moves on; History shows it under Today.
3. Insights opens on 90 days, led by the morning dizziness finding.
4. Prepare shows the appointment in 12 days and Aisha's two questions.
5. Reset → back to Today with fresh data.
6. The browser console shows no errors and no `[demo]` messages.

Also check that a normal build is unaffected: `npx tsc --noEmit` and
`npx expo lint` should be clean, and nothing outside the table above should
read `IS_DEMO`.
