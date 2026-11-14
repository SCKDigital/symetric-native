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
npm run render    # out/ninety-days.mp4, 1080 x 1920
```

## Films

- `NinetyDays` (11s): every check-in arrives as a stripe, then the film closes
  in on the weekday that stands out and states the finding in the app's own
  sentence shape.

## Rules a film has to keep (docs/brand.md)

- A colour names a measurement. Take every hue from `data.generated.json`.
- Every number is computed, and shown with its count.
- Ease out, no bounce.
- "Sample data" stays on screen for as long as data does.

Remotion is free for individuals and companies of up to three people; check
its licence before the team grows.
