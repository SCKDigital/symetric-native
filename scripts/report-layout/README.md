# Report layout check

The PDF report is HTML handed to `expo-print`, which renders it with the
platform's print WebView — WebKit on iOS, Chromium on Android. Neither is
runnable from a build machine, so every page budget in the report used to be
arithmetic: a sparkline row is about 83pt, a US Letter page holds about 684pt
of body, therefore six rows fit. Nothing checked whether that was true.

It was not. The first run of this check found four logical pages overflowing
onto a second physical sheet — which carries no header, no footer and no page
number, while the "Page 3 of 10" printed above it goes on claiming otherwise.

## What it does

Builds a deliberately maximal report (every list saturated, 8 mind and 9 body
domains, 90 days) and measures each logical page in a real browser, against
the printable area `printToFileAsync` produces: 612x792pt less this report's
own margins, so 504x684pt.

Chromium is the engine family Android's print WebView belongs to, so this is
both a regression check and a reasonable proxy for the Android PDF.

## Running it

```
npx esbuild scripts/report-layout/fixture-report.ts --bundle --platform=node \
  --format=cjs --alias:@=./src --outfile=.tmp-fixture.js
node .tmp-fixture.js .tmp-report.html
node scripts/report-layout/measure-report.mjs .tmp-report.html
```

Exits non-zero if any page overflows.

## The font, and why the check runs twice

Android has no Helvetica and no Arial. It substitutes Roboto, whose metrics
are not Helvetica's, so the same document paginates differently on the two
platforms. Measured on this report: five of eleven pages overflowed under an
Android-like font while all eleven fitted under Helvetica.

Every budget is therefore fitted to the WIDER rendering, so the narrower one
always has room. Check both before changing any page:

```
node scripts/report-layout/measure-report.mjs .tmp-report.html --font "Noto Sans, sans-serif"   # Android-ish
node scripts/report-layout/measure-report.mjs .tmp-report.html --font "Arial, sans-serif"       # iOS-ish
```

Noto Sans stands in for Roboto because it is present on most build machines
and is slightly wider, which makes it the conservative choice. Embedding a
font in the report would remove the whole problem, at roughly a megabyte of
base64 per generated document.

## When a page overflows

Prefer, in order: move a section to its own page (the report already
paginates charts this way), cap a list and say what is not shown (the
`overflow-note` convention), then tighten padding. Shrinking type is the last
resort — a clinician reads this on paper.
