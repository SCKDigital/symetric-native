# Marketing visuals: where we got to, and how to pick it up

Written 14 November 2026. This is the handover for the marketing-visual work
done that day: what was decided, what was turned down, what exists, and the
next steps. Read it before making any new marketing image or video.

**Status in one line:** the direction is *the data is the picture*. One film
exists and was approved ("it's great"). Nothing here is committed yet, and
nothing has been posted anywhere.

---

## The split that started this

- **App Store screenshots must be true screens.** They live in
  `store/app-store-screenshots/` and are rebuilt by `build-artboards.mjs`.
  Leave them alone when doing marketing work.
- **Marketing can stylise**, but only shows findings the app really produces,
  from the sample dataset, with their counts.

The framing throughout is **report first**: the product's payoff is the PDF
someone hands a clinician, and the check-ins are how you get there.

---

## What was decided

| Question | Decision |
|---|---|
| Main marketing image | **Data drawn as colour**: a person's check-ins as stripes, ribbons, weekday bars. Vivid, but each colour still names a measurement, so the one rule in `docs/brand.md` holds. |
| How it is made | **In code, from the app's own files.** Never drawn by hand in a design tool, so it cannot drift from the palette or invent shapes the data lacks. |
| Secondary directions | **Paper and pen** (the report as a physical page, highlighter, handwritten questions) for the report-first story. **Clay / 3D data objects** for a launch campaign if there is budget. |
| Brand guide | The 10-board mock-up was approved as a direction. It proposes DM Sans + Inter as the brand typefaces. |

## What was turned down, and why

Do not re-propose these without a new reason.

- **A dark screen with text and a phone.** The user's words: marketing needs
  "something that isn't just black screen with text". This is what the first
  six marketing boards mostly were.
- **Photos of people**, in all three forms tried: people blurred in the
  background, empty places with the report in shot, and real users talking to
  camera. "Not convinced by these."
- **Hands-only photography** and **drawings/illustration**: the user has
  reservations about both.
- Already ruled out earlier: gradient backgrounds, whole headlines in a
  symptom colour, stock wellness imagery, medical props, invented quotes.

---

## What exists

### Canvases (private until shared from the page's Share menu)

- **Marketing options**: six 1290 × 2796 boards built from the Insights
  screen (A Wednesdays chart, B notes, C pairs, D month calendar, E "+2.1"
  poster, F the report on a desk).
  https://claude.ai/artifact/MxZquZNHPUwRXFk4UjC5JL
- **Brand guide mock-up**, three pages:
  https://claude.ai/artifact/FfuYFx2N59FN5CMTJfqG53
  - *Brand guide*: 10 boards (idea, logo, colour, type, app, voice,
    marketing system, imagery).
  - *Imagery options*: the three photo approaches that were turned down.
  - *Visual directions*: 1 data as picture (chosen), 2 paper and pen,
    3 data you could hold.

None of the canvas boards were rendered and checked; expect a few text wraps.
Board 10 of the guide still says "hands, not faces" and needs rewriting to
match the decision above.

### The film project: `scripts/data-film/`

A small Remotion project with its own `package.json`, so Remotion never
enters the app's dependencies. The root `tsconfig.json` already excludes
`scripts`; `eslint.config.js` ignores this folder; `.gitignore` ignores its
`out/` and the generated data file.

```
cd scripts/data-film
npm install
npm run studio    # preview and scrub in the browser
npm run render    # out/ninety-days.mp4
```

| File | Job |
|---|---|
| `prepare-data.mjs` | Parses colours from `src/lib/domains.ts`, the mark from `src/components/symetric-logo.tsx`, and the rows from `src/lib/demo/aisha-tables.json`. Computes every number a film shows. Writes `src/data.generated.json`. |
| `src/NinetyDays.tsx` | The film. Timeline and layout constants are at the top. |
| `src/Root.tsx` | Registers compositions (size, length, frame rate). |

**`NinetyDays`** (1080 × 1920, 11 s): stripes fill in day by day → every row
but Sensory overwhelm fades → Wednesdays stay lit → weekday bars rise →
"+1.8" lands → the finding in the app's sentence shape → logo.

Six more films followed the same day, one per board on the Marketing options
canvas (`Wednesdays`, `Notes`, `Pairs`, `Month`, `Number`, `Paper`); see
`scripts/data-film/README.md`. Where a board's claim was not in the sample
data, the film follows the data: the "Dizziness and Anxiety move together"
pair is not in the current sample tables, so the films use pairs the
detector found (Concentration with Energy; Brain fog against Concentration),
and the month film's "N days missed" headline is whatever the count is (six, after
missed days were added to the sample data: `MISSED_DAYS` in `aisha-data.ts`).

The films show **+1.8, 13 of 13 weeks** (the full 90 days, matching the
sample report). The canvases show **+2.1, 4 of 4 weeks** (the app's 30-day
Insights figure). Both are true for their window; pick one per piece and do
not mix them inside it.

---

## Rules every marketing visual keeps

1. **A colour names a measurement.** Take hues from `data.generated.json`
   (that is, from `domains.ts`). Never use a symptom colour for a headline,
   background or decoration.
2. **Every number is computed and shown with its count** (days, weeks,
   check-ins). No figure is typed in.
3. **"Sample data" stays on screen** for as long as data does. Aisha is a
   design persona and is never presented as a real person.
4. **No condition names, no verdicts, no streaks.** Symptoms and observations
   only.
5. **Motion eases out and never bounces.** Use real-time pacing where speed
   is the claim (the twenty-second check-in).
6. **Voice:** calm, plain, no exclamation marks, no emoji. Headlines in two
   tones: a grey set-up line, a white payoff, DM Sans 700.

---

## How to add the next film

1. If it needs a new number, compute it in `prepare-data.mjs` and add it to
   the output. Do not calculate inside the component from memory.
2. Copy `NinetyDays.tsx`, keep the constants-at-the-top shape, and register
   it in `Root.tsx`.
3. Add a `render` script for it in `package.json`.
4. Render three or four stills (`npx remotion still … --frame=N`) and look at
   them before rendering the whole video.

For other sizes, add another `<Composition>` with a different width and
height (feed is 1080 × 1350, square 1080 × 1080) and make the layout
constants depend on it.

## Next steps, in rough order

- [ ] User feedback on the film's feel: speed, stripe brightness (currently
      fairly muted), whether the turn to Wednesdays lands.
- [ ] A feed (1080 × 1350) and square cut of `NinetyDays`.
- [ ] A second film: "three months as ribbons" with the week of 19 Sept where
      four things moved at once.
- [ ] Static exports of the stripes for the website hero and store promo art.
- [ ] Rewrite brand-guide board 10 around data-as-picture.
- [ ] Update `docs/brand.md`: it still says porcelain is the default accent,
      but `accents.ts` made slate the default on 14 Nov 2026 (four accents).
- [ ] Decide whether to adopt DM Sans + Inter formally as brand typefaces.
- [ ] Commit `scripts/data-film/` and this file.
- [ ] Later ideas: let users export their own data portrait; paper-and-pen
      shoot; clay or Blender-rendered data objects.

## Tools considered

| Tool | For | Note |
|---|---|---|
| **Remotion** | Video from React code | In use. Free for individuals and companies of up to three people; check the licence if the team grows. |
| **D3** (`d3-scale`, `d3-shape`) | Turning numbers into shapes | Not needed yet; bring in for ribbons and curves. |
| Headless Chrome | Static PNGs | Already used by the screenshot script. |
| Motion Canvas | Alternative to Remotion | Only if timing needs finer control. |
| three.js | 3D data forms on the web | For a woven-ribbon hero. |
| Blender + Python | Photo-real clay data objects | Keeps heights true to the data. |
| Rive / Lottie | Animated charts inside the app and site | If the same animation should run in-app. |
| GSAP | Scroll-driven animation on symetric.app | With the film's components in an Astro island. |

---

## What the research said

Mostly agency commentary, not controlled studies. Treat as direction.

- Under-35s treat wellness claims as doubtful until shown, and read
  authenticity as consistency rather than polish
  ([Personal Care Insights](https://www.personalcareinsights.com/news/gen-z-skin-wellness-trends.html),
  [Minding Her Own Business](https://mindingherownbusiness.beehiiv.com/p/why-gen-z-doesn-t-trust-your-marketing)).
- Brands in this space mostly lead with colour, objects and craft, not
  people. How We Feel made colour the emotion itself
  ([Yale](https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/));
  Headspace rebuilt around illustration and a custom typeface
  ([It's Nice That](https://itsnicethat.com/articles/italic-studio-headspace-graphic-design-project-250424));
  Leva aimed for "not too soft, not too clinical"
  ([Creative Boom](https://www.creativeboom.com/news/leva-rebrand/)).
- Handmade-looking work (stop-motion, clay, collage) is rising because it
  reads as human next to AI imagery
  ([Hashtag Paid](https://hashtagpaid.com/banknotes/gen-z-visual-strategy-2026-why-design-is-now-a-performance-channel)).
- Data visualisation and motion are listed health-design trends
  ([Designity](https://www.designity.com/blog/healthcare-design-what-you-need-to-know-about-the-latest-trends)).
- Chronic-condition users worried gamification trivialises their health
  ([JMIR 2026](https://www.jmir.org/2026/1/e94017)); doctor-ready PDFs are a
  selling point other trackers lead with.
- Most top mental-health apps' privacy policies need college-level reading
  ([Mozilla](https://aidatabase.mozilla.org/ai-intersections-database/mental-health-app-developers-are-dishonest-about-their-failure-to-protect-users-privacy/)),
  hence a one-line privacy statement.
- Australia restricts testimonials in health advertising. Check before any
  paid post that features a real user.

## Related

- `docs/brand.md`: the brand rules (stale on the default accent, see above).
- `docs/demo-profile-aisha.md`: what the sample dataset is designed to show.
- `docs/web-demo.md`: the website demo runs on the same sample tables.
- `store/app-store-screenshots/`: the true-screen store set.
