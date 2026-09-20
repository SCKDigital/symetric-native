# Symetric brand guide

Last updated 20 September 2026, for app version 1.4.0.

**The code is the source of truth, not this file.** Colours live in
`src/constants/brand.ts` (the app's own colour) and `src/lib/domains.ts` (the
colours that identify measurements). This document exists to say *why* they
are what they are, and which rules will quietly break the product if ignored.

If you change a value in the code, change it here. If the two disagree,
the code is right and this file is stale.

**A PDF of this guide**, with swatches, variant washes and the contrast
figures, is at `docs/symetric-brand-guide.pdf` — the version to send someone
who is not going to read a repo. It is generated, not maintained by hand:

```
node scripts/make-brand-guide.mjs
```

Regenerate it after any change to `brand.ts`, `domains.ts`, `comfort-theme.ts`
or `report/theme.ts`, or it will start telling people the wrong hex.

---

## The one rule

**The brand colour and the data colours are separate systems, and neither may
borrow from the other.**

This is not a stylistic preference. Symetric's entire job is to show someone
which of their symptoms moved together. A colour on a chart is a claim about
*which measurement you are looking at*. If the app's own chrome uses the same
colour, the claim stops being trustworthy.

It has already gone wrong once. Until v1.4.0 the accent was `#818cf8` — and so
was the Mood domain. The same hex, in 71 places, one of which meant Mood and
seventy of which meant "this is a button". Every link and active pill in the
app was painted the colour that means Mood on every chart.

Practically:

- Reaching for a colour to identify a **measurement**? `src/lib/domains.ts`.
- Reaching for a colour for a **control, link, or surface**? `src/constants/brand.ts`.
- An unrecognised factor gets `UNKNOWN_FACTOR_COLOR`, a deliberate neutral. It
  must never fall back to the brand colour, or moving the brand silently
  recolours data.

---

## The mark

A rounded tile with an **S** cut from a gradient of the domain colours.

The gradient is the point: the mark is literally made of the palette the app
measures with — cyan, emerald, blue, violet, pink, orange, amber, in that
order, at 0/17/34/50/67/84/100%. Do not substitute a flat fill, do not
re-order the stops, and do not recolour the S to match a campaign.

Defined once, in `src/components/symetric-logo.tsx`. Everything else is
generated from it by `scripts/make-icons.mjs`, which reads the path, the
gradient and the placement out of that component so the icon can never drift
from the mark. **Regenerate rather than redraw.**

| Context | Tile | Glyph fills |
|---|---|---|
| In-app lockup | `BRAND.tile` `#0B2B2A` | 41% of the tile |
| Launcher icon | `BRAND.fill` `#0F6E56` | 58% of the tile |
| Android adaptive foreground | transparent | 50%, inside the safe zone |
| Splash | transparent | 88% |

The two tile colours are deliberate. In-app, the mark sits on a near-black
screen and a near-black tile is correct. A home screen is not that: an
almost-black icon disappears against a dark wallpaper, so the launcher tile
uses the brand teal instead.

**Never ship the Expo placeholder.** Versions up to 1.3.0 shipped with
`expo-symbol 2.svg` and a `grid.png` on Expo's default blue — a template icon,
in the stores, for the life of the app. If `assets/expo.icon/Assets/` ever
contains a file with `expo-symbol` or `grid` in its name, something has been
reset.

---

## Colour: the app

Teal. It is the same ink as `theme.colors.teal` in the PDF report, where it
already means "improved" — so the app and the document it produces are one
brand rather than two.

| Token | Value | Use |
|---|---|---|
| `BRAND.fill` | `#0F6E56` | Primary button, under a white label |
| `BRAND.fillAlt` | `#15887A` | Gradient partner, secondary fills |
| `BRAND.text` | `#4FD1C5` | Links, icons, active labels |
| `BRAND.textSoft` | `#99E6DB` | Larger or lower-emphasis accent text |
| `BRAND.textFlat` | `#3FB8A8` | Settings accents, a touch flatter |
| `BRAND.border` | `#1A5C4E` | Accent card borders |
| `BRAND.surface` | `#0B1A1B` | Accent card backgrounds |
| `BRAND.signIn` | `#0F7A60` | The sign-in button, historically its own shade |
| `BRAND.tile` | `#0B2B2A` | The in-app logo tile |

Translucent washes go through `brandTint(BRAND.x, alpha)`. Do not hand-write
`rgba(...)`: 43 of those were the reason the last colour change could not be
done with search and replace, because raw channel numbers have no textual link
to the colour they are a tint of.

Background is `#0a0c12`. Body text `#e2e8f0`.

### Comfort mode

A muted version of the same hue, in `src/lib/comfort-theme.ts`, for users who
find the normal accent too loud. Derived from the brand — if the brand moves,
these move with it, or comfort mode is quietly still wearing last year's
colour.

`#2F5450` fill · `#9FC3BB` text · `#1E3330` border.

---

## Colour: the data

From `src/lib/domains.ts`. These identify measurements and are not brand
colours. They change only if the meaning changes.

| Domain | | Domain | |
|---|---|---|---|
| Mood | `#818cf8` | Motivation | `#c084fc` |
| Energy | `#34d399` | Social depletion | `#a78bfa` |
| Anxiety | `#fb923c` | Sensory overwhelm | `#fbbf24` |
| Concentration | `#38bdf8` | Sleep | `#7B9EB8` |
| Irritability | `#f472b6` | | |

Every **body** domain shares one colour, `BODY_COLOR` `#BC812F`, because body
domains are read as a group against mind. `UNKNOWN_FACTOR_COLOR` `#8892a4` is
the neutral for anything unrecognised.

**Adding a domain colour:** check it against the brand tokens *and* every
existing domain using perceptual distance, not hue. Anything under ΔE 15 is
confusable at a glance. For reference, the current teal sits ΔE 42 from the
nearest data colour.

---

## Colour: print

The PDF report has its own palette in `src/lib/report/theme.ts` and does not
use the app's tokens. **A screen colour chosen for a near-black background can
be invisible on white** — the brand's `#4FD1C5` manages 1.9:1 there.

Ink `#1F2937` · muted `#6B7280` · rules `#D1D0C8` · teal (improved) `#0F6E56` ·
coral (concerning) `#A32D2D` · amber (watch) `#854F0B`.

Known gap: `theme.colors.mindLine` is 3.0:1 on white, thin for a line a
clinician reads. Documented in the file; not yet changed.

---

## Shape

- **8pt** — chips, pills, tabs, filter controls, buttons
- **12pt** — standard cards and inputs
- **16–24pt** — hero cards and modals
- Circles stay circles: the PIN keypad, the comfort button, icon badges

Controls were capsule-shaped until v1.4.0. Eight reads as a control rather
than a tag, and echoes the cards behind it.

---

## Typography

**There is no brand typeface, and this is a known gap.**

The app uses each platform's system font. The report asks for
`Roboto, "Noto Sans", Helvetica, Arial, sans-serif` — Roboto first so that
Android's substitution is deliberate rather than accidental.

This matters more than it sounds. Android has neither Helvetica nor Arial, so
the same document paginated differently on the two platforms: measured at five
of eleven report pages overflowing under an Android-like font while all eleven
fitted under Helvetica. Every page budget is therefore fitted to the **wider**
of the two renderings, so the narrower one always has room. If you add a
typeface, re-run `scripts/report-layout/` before believing the report still
fits.

---

## Voice

Calm, plain-spoken, low-hype. No exclamation points, no emoji, no empowerment
language. Speaks like a competent friend, not a wellness brand.

Sentences say what will happen — "takes about 20 seconds each time" — rather
than selling a feeling. Steady, unfussy, respectful of the reader's attention,
because the audience is managing a chronic illness and has been sold to
enough.

Two rules the product itself depends on:

- **Never overclaim a finding.** "Correlation is not causation" is printed on
  every page of the report for a reason. Say what was measured and over how
  many days.
- **Never imply a verdict on the person.** A domain sitting at baseline is
  typical for them, not "fine".

Fuller positioning, and the Aisha persona this is written for, in
`mosaic-app/.agents/product-marketing.md`. The voice section there is marked
as inferred from in-product copy and still wants confirming.

---

## Accessibility

Floors: **4.5:1** for body text, **3:1** for large or bold. Every brand token
meets them in the direction it is used.

| | Ratio |
|---|---|
| White on `BRAND.fill` | 6.2:1 |
| `BRAND.text` on background | 10.5:1 |
| White on comfort fill | 8.4:1 |
| Comfort text on background | 10.2:1 |

Colour is never the only signal. Charts carry labels and numbers; findings
carry a confidence word, not just a tier colour.

---

## Checking you haven't broken it

- `scripts/make-icons.mjs` — regenerates every icon from the mark
- `scripts/report-layout/` — renders the report in a real engine and fails if
  a page overflows; run it under both fonts
- `npx expo config --type introspect` — confirms icons, the notification tint
  and the iOS entitlement resolve

---

## Not settled

- **No brand typeface.** The largest open question here.
- **Store screenshots** (`mosaic-app/marketing/app-store-screenshots/`, 17
  artboards) still show the indigo accent and the placeholder icon.
- **The report's mind-line ink** is thin on white.
- **Voice** is documented but inferred rather than confirmed.
