# Symetric brand guide

Last updated 21 September 2026, for app version 1.5.0.

**The code is the source of truth, not this file.** Colours live in
`src/constants/accents.ts` (the three accents the user picks between) and
`src/lib/domains.ts` (the colours that identify measurements). This document
exists to say *why* they are what they are, and which rules will quietly break
the product if ignored.

If you change a value in the code, change it here. If the two disagree,
the code is right and this file is stale.

**A PDF of this guide**, with swatches, variant washes and the contrast
figures, is at `docs/symetric-brand-guide.pdf` — the version to send someone
who is not going to read a repo. It is generated, not maintained by hand:

```
node scripts/make-brand-guide.mjs
```

Regenerate it after any change to `accents.ts`, `domains.ts`, `comfort-theme.ts`
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
- Reaching for a colour for a **control, link, or surface**? `useAccent()`.
- An unrecognised factor gets `UNKNOWN_FACTOR_COLOR`, a deliberate neutral. It
  must never fall back to the accent, or moving the brand silently recolours
  data.

---

## The accent is the user's

Since v1.5.0 there are three accents and the person picks one in Settings. The
choice lives on `profiles.accent` so it follows them between devices.

| | Fill | Label on it | Accent text |
|---|---|---|---|
| **Porcelain** (default) | `#E7E2D9` | `#0A0C12` | `#C8B79A` |
| Teal | `#0F6E56` | `#FFFFFF` | `#4FD1C5` |
| Plum | `#7A1A82` | `#FFFFFF` | `#DDA0E8` |

The reasoning is the one that produced comfort mode. This app is used daily,
often for years, often by someone who feels bad. What colour the chrome is
carries no information at all, so handing that one piece back costs nothing.
What is *not* negotiable is the data palette — see the one rule above.

**Porcelain is the default because it is the only option that cannot collide
with a data colour under any circumstance: it has no hue to collide with.** A
near-white button is unambiguously chrome.

### Every accent is a family, not a hex

An accent has to be legible in two opposite directions — as coloured text on a
near-black background, and underneath a label when it fills a button — and no
single value does both. So each carries its own **`onFill`**. Porcelain takes a
near-black label where the other two take white; swapping one hex would have
produced white-on-porcelain at 1.3:1, which is invisible.

Anywhere a label sits on an accent fill it reads `onFill`. Hard-coding
`'#ffffff'` was true in 24 places before this existed.

### What a new accent has to clear

`scripts/check-accents.mjs` parses the real palette out of the source and fails
on any of these, so the list is enforced rather than aspirational:

- Accent text reads **4.5:1** on `#0a0c12` (3:1 for `textSoft`, only used large).
- Each fill's paired label reads **4.5:1** on it.
- Nothing lands within **ΔE 15** of a domain colour.
- No accent text lands within **ΔE 15** of body text `#e2e8f0`, or a link stops
  looking like a link.
- The three fills sit at least **ΔE 25** apart, or the setting does nothing
  visible.

That fourth check is why porcelain's text is `#C8B79A` and not the obvious
off-white `#D6CFC2` from the original option sheet: the off-white measured
ΔE 14.6 from body text, so every link in the app would have read as prose.

### Two things the choice cannot reach

The launcher icon, the splash and the Android notification tint are baked into
`app.json` and the PNGs at build time, so they wear the **default** accent
whatever the user picks. `BRAND` in `src/constants/brand.ts` exists for exactly
those cases, plus code that runs outside the React tree. If you are writing a
component you want `useAccent()`.

Android also fixes a notification channel's properties when it is created and
ignores later changes, so the channel's LED colour is the default's too.

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
| In-app lockup | the accent's `tile` | 41% of the tile |
| Launcher icon | `#2A251C` (the default's `tile`) | 58% of the tile |
| Android adaptive foreground | transparent | 50%, inside the safe zone |
| Splash | transparent | 88% |

**One tile, on both, since v1.5.0.** The launcher used the accent's `fill`
until then, on the reasoning that an almost-black icon disappears against a
dark wallpaper. Measuring it killed that rule. The mark is seven light,
saturated colours, so what it needs is a dark ground:

| Tile | Worst gradient stop | Best |
|---|---|---|
| Porcelain `fill` `#E7E2D9` | 1.29:1 | 2.11:1 |
| Teal `fill` `#0F6E56` (what shipped in 1.4) | 2.28:1 | 3.72:1 |
| Porcelain `tile` `#2A251C` | 5.34:1 | 8.71:1 |

The trade is separation from a dark wallpaper — 1.4:1 against pure black, where
the teal managed 3.4:1. Worth taking: both platforms mask and shade the icon
themselves, a pure-black wallpaper is the worst case rather than the common
one, and an icon you cannot read is worse than one that sits quietly.

**Never ship the Expo placeholder.** Versions up to 1.3.0 shipped with
`expo-symbol 2.svg` and a `grid.png` on Expo's default blue — a template icon,
in the stores, for the life of the app. If `assets/expo.icon/Assets/` ever
contains a file with `expo-symbol` or `grid` in its name, something has been
reset.

---

## Colour: the app

The default accent's tokens. The other two carry the same roles — see
`src/constants/accents.ts` for all three.

| Token | Porcelain | Use |
|---|---|---|
| `fill` | `#E7E2D9` | Primary button |
| `onFill` | `#0A0C12` | The label on `fill`, `fillAlt` and `signIn` |
| `fillAlt` | `#CFC7B6` | Gradient partner, secondary fills |
| `text` | `#C8B79A` | Links, icons, active labels |
| `textSoft` | `#DACEB8` | Larger or lower-emphasis accent text |
| `textFlat` | `#B5A386` | Settings accents, a touch flatter |
| `border` | `#3A3229` | Accent card borders |
| `surface` | `#14120E` | Accent card backgrounds |
| `signIn` | `#EFEBE3` | The sign-in button, historically its own shade |
| `tile` | `#2A251C` | The logo tile |

Translucent washes go through `brandTint(token, alpha)`. Do not hand-write
`rgba(...)`: 43 of those were the reason the 1.4.0 colour change could not be
done with search and replace, because raw channel numbers have no textual link
to the colour they are a tint of.

Background is `#0a0c12`. Body text `#e2e8f0`.

`fillAlt` was doing two incompatible jobs until 1.5.0 — solid button fill *and*
accent text — and failed one of them: white on teal's `#15887A` was 4.34:1,
under AA for a 14px button label. It is a fill now, darkened to `#13806F`, and
the five places using it as text moved to `textFlat`.

### Comfort mode

A muted version of whichever accent is on, plus a 1.15× type scale, for users
who find the normal accent too loud. Each accent carries its own `quiet` block
rather than having one computed by formula: pulling chroma back by a fixed
ratio works for a saturated teal and falls apart for porcelain, which is
already near-white and gets quieter by going *down* in lightness.

Porcelain's: `#BDB4A5` fill · `#A99C86` text · `#2E2921` border.

---

## Colour: the data

From `src/lib/domains.ts`. These identify measurements and are not brand
colours. They change only if the meaning changes, and they do **not** move when
the accent does.

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

**Adding a domain colour:** check it against all three accents *and* every
existing domain using perceptual distance, not hue. Anything under ΔE 15 is
confusable at a glance.

---

## Colour: print

The PDF report has its own palette in `src/lib/report/theme.ts` and does not
use the app's tokens. **A screen colour chosen for a near-black background can
be invisible on white** — porcelain's `#C8B79A` manages 2.0:1 there, and teal's
`#4FD1C5` 1.9:1.

Ink `#1F2937` · muted `#6B7280` · rules `#D1D0C8` · teal (improved) `#0F6E56` ·
coral (concerning) `#A32D2D` · amber (watch) `#854F0B`.

The report's palette is fixed and does **not** follow the accent. A clinical
document that changes colour because the patient liked a different button is
not a document anyone should trust, and the report's teal/coral/amber carry
meaning — improved, concerning, watch — that an accent would collide with.

Known gap: `theme.colors.mindLine` is 3.0:1 on white, thin for a line a
clinician reads. Documented in the file; not yet changed.

---

## Shape

- **8pt** — chips, pills, tabs, filter controls, buttons. *This is the one
  radius the guide actually specifies.*
- **10–16pt** — cards and inputs, in practice
- **20–24pt** — hero cards and modals
- Circles stay circles: the PIN keypad, the comfort button, icon badges

Controls were capsule-shaped until v1.4.0. Eight reads as a control rather
than a tag, and echoes the cards behind it.

**The card radii are not yet a scale.** The codebase uses 10 in 44 places, 12
in 43, 16 in 22 and 14 in 15, plus a long tail of 2/3/4/5/6/7/9/17/20/32. Those
values arrived with the components that were ported, not from a decision. This
section describes what is true rather than a three-step scale nothing follows.
Normalising them is an open job, not a rule anyone is currently breaking.

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

Floors: **4.5:1** for body text, **3:1** for large or bold. Every token of
every accent meets them in the direction it is used, and
`scripts/check-accents.mjs` fails the build if one slips.

| | Label on fill | Accent text on background |
|---|---|---|
| Porcelain | 15.2:1 | 10.0:1 |
| Teal | 6.2:1 | 10.5:1 |
| Plum | 9.1:1 | 9.6:1 |
| Porcelain, comfort | 9.5:1 | 7.2:1 |
| Teal, comfort | 8.4:1 | 10.2:1 |
| Plum, comfort | 11.6:1 | 8.0:1 |

Colour is never the only signal. Charts carry labels and numbers; findings
carry a confidence word, not just a tier colour. The accent picker itself
carries a tick, not only a ring.

---

## Checking you haven't broken it

- `node scripts/check-accents.mjs` — every contrast and separation floor above
- `node scripts/make-icons.mjs` — regenerates every icon from the mark
- `node scripts/make-brand-guide.mjs` — regenerates the PDF from the source
- `scripts/report-layout/` — renders the report in a real engine and fails if
  a page overflows; run it under both fonts
- `npx expo config --type introspect` — confirms icons, the notification tint
  and the iOS entitlement resolve

---

## Not settled

- **No brand typeface.** The largest open question here.
- **Store screenshots** (`mosaic-app/marketing/app-store-screenshots/`, 17
  artboards) show the indigo accent and the placeholder icon — two brands out
  of date now, not one.
- **The card radii are not a scale**, and the guide now says so rather than
  pretending otherwise.
- **The report's mind-line ink** is thin on white.
- **Voice** is documented but inferred rather than confirmed.
