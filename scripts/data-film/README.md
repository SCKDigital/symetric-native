# Data films

Marketing videos drawn in code ([Remotion](https://www.remotion.dev)) from the
sample dataset and the app's own colour file. Nothing is typed in by hand:

- **Colours and the mark** are parsed out of `src/lib/domains.ts` and
  `src/components/symetric-logo.tsx` by `prepare-data.mjs`.
- **Numbers** come from `src/lib/demo/aisha-tables.json`. Every figure on
  screen (the weekday gap, the week count) is computed from those rows, so
  rebuilding the sample data changes the film.

This is its own package, so Remotion never enters the app's dependencies.

```
cd scripts/data-film
npm install
npm run studio    # preview and scrub in the browser
npm run render:all   # every film, to out/
```

## Films

All 1080 x 1920, 30fps. `npm run render:all` renders every one to `out/`.

| Id | Length | What it does |
|---|---|---|
| `NinetyDays` | 11s | Every check-in arrives as a stripe, then the film closes in on the weekday that stands out. |
| `Wednesdays` | 8s | The question, then the average-by-weekday chart and the gap. |
| `Notes` | 10s | Scribbled notes land, then recede behind two real findings. The notes are a dramatisation; the findings are not. |
| `Pairs` | 11s | Three links drawn one at a time: two from the detector's own output, one weekday link. |
| `Month` | 9s | The last 30 days as a calendar; missed days are blanks. The headline count is computed. |
| `Number` | 8s | The gap, huge, counting up, then the ninety days it came from. |
| `Paper` | 10s | A report page slides in and a pen marks it. Every line on the page is computed or read from the sample tables. |

`src/kit.tsx` holds the shared pieces: fonts, colours, easing, the headline,
the lockup and the sentence shapes.

## Rules a film has to keep (docs/brand.md)

- A colour names a measurement. Take every hue from `data.generated.json`.
- Every number is computed, and shown with its count.
- Ease out, no bounce.
- "Sample data" stays on screen for as long as data does.

Remotion is free for individuals and companies of up to three people; check
its licence before the team grows.
