# Sample report (Aisha)

Builds the sample PDF the marketing site offers as "read a real report before
you install anything", at
`symetric-marketing/public/symetric-sample-report.pdf`.

```
node scripts/sample-report/build.mjs            # writes the site's PDF
node scripts/sample-report/build.mjs out.pdf    # or anywhere else
```

Every run also writes `src/lib/demo/aisha-tables.json`, the website demo's
starting data: Aisha's rows plus everything detection stored from them. This
keeps the demo showing what the PDF shows. Commit it whenever you commit a new
PDF. See `docs/web-demo.md`.

Needs Node and Chrome (or Edge). The first run installs a private copy of
esbuild into `.tmp-sample-report/`, which is gitignored.

## Why it is built this way

The report is only worth showing if it is what the app would actually produce,
so nothing in it is written by hand. `aisha-data.ts` holds raw rows only:
check-ins, sleep logs, body check-ins, events, markers. Every finding comes
from the app's own code running over them:

1. **Weekly detection, replayed.** In the app the connection, sleep and
   circadian detectors look at the 30 days before "now" and store a row each
   time they run; the report reads those rows back across its whole range.
   So the generator moves the clock to each week of the 90 days in turn, shows
   the detectors only what had been entered by then, and runs the same
   baseline recalc and `forcePatternDetection` the app does.
2. **`generateReport`, unmodified.** Its output is printed to PDF in headless
   Chrome, the engine family Android's print path uses.

Only four things are stand-ins, swapped in at bundle time by `build.mjs`: the
Supabase client (`fake-supabase.ts`, an in-memory store that throws on any
query it does not implement, rather than quietly returning nothing), the
device key-value store, `expo-print`, and React Native itself.

The generator prints a summary of what detection found. If a change to the
detectors or the data empties a section, it shows there before it shows in
the PDF.

## Changing Aisha

The persona and story are specified in `docs/demo-profile-aisha.md`.
Two rules from it matter most: she tracks a curated five mind domains, not all
eight, and nothing may read as the report pointing toward a diagnosis.

The detectors are strict about shape, which is why the story beats are spaced
the way they are (see the comments in `aisha-data.ts`):

- Each day is compared with the median of the fortnight before it, so a
  gradual change is absorbed and never flagged. The flare arrives with the
  letter rather than building up.
- An intervention's effect is read from the 21 days either side of it. Keep
  each marker's windows clear of the flare, or the flare ending gets credited
  to whatever came next.
- A one-tap entry records the person's baseline. Mixed into a day of real
  answers during a flare, it reads as a large swing within the day.

After any change, check the layout under both fonts:

```
node scripts/report-layout/measure-report.mjs .tmp-sample-report/aisha-report.html --font "Noto Sans, sans-serif"
node scripts/report-layout/measure-report.mjs .tmp-sample-report/aisha-report.html --font "Arial, sans-serif"
```

Dates are relative to the day it is built (the 90 days end yesterday), so
rebuilding later produces the same story with current dates.
