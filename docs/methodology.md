# The science and math behind Symetric

**Status**: Technical reference, grounded directly in the current implementation (`src/lib/`). Every threshold below is quoted from source, not approximated — if the code changes, this doc goes stale and should be re-checked against it, not trusted on its own.

**Audience**: This is written to be usable two ways — as internal/engineering documentation, and as the basis for the in-app "methodology" page already referenced in code comments (`src/lib/detection/computeConnection.ts`: *"Exported so the PDF methodology page can surface the actual values in use"*). Anything below that's fine for a user or clinician to read is written that way already; anything that isn't is marked.

**The one-sentence version**: Symetric doesn't run machine learning or population-level medical models. Everything it detects is a personal-baseline comparison, computed with textbook statistics, over data the user logged about themselves. Nothing here is inferred from other people's data, and nothing here diagnoses anything.

---

## 1. Why frequent check-ins, not one big form: Ecological Momentary Assessment

**EMA** — before the math, worth being precise about which "EMA" this is, since the term is genuinely ambiguous:

- **Ecological Momentary Assessment** (the research methodology) — repeated, real-time sampling of a person's state *in their actual environment*, close to the moment it happens, instead of asking them to reconstruct it later from memory. This is the one Symetric's design follows.
- **Exponential Moving Average** (a smoothing technique, decay-weighted toward recent values) — this is *not* what Symetric uses anywhere in the codebase. Baselines use a **rolling median** instead (see §2) — worth flagging explicitly since it's an easy mix-up and the two behave differently (a median ignores a single bad outlier day; an exponential moving average would still be dragged by it, just by a shrinking amount over time).

The relevant research finding behind EMA as a methodology (Stone & Shiffman's foundational work, and the substantial literature since) is that **retrospective recall of symptoms is measurably unreliable** — people systematically misremember severity, frequency, and timing once they're outside the moment, more so the longer the gap and the more symptoms they're trying to hold in mind at once. This is precisely the failure mode Aisha hits at a doctor's appointment: reconstructing "how the last three months have gone" from memory, under time pressure, is a known-bad instrument.

**How Symetric implements this, concretely**: check-ins are scheduled multiple times per day (`checkInsPerDay`, user-configurable) inside a user-chosen active window (`windowStart`–`windowEnd`, set during onboarding — see `src/components/onboarding/CheckInPreferencesStep.tsx`), each one prompted in the moment rather than filled in from memory at the end of the day. This is what makes the ~20-second design constraint scientifically load-bearing rather than just a UX nicety — EMA's validity depends on the burden per sample staying low enough that people actually respond in the moment instead of batch-filling several at once from memory (which would silently turn momentary data back into recalled data).

---

## 2. Personal baselines: rolling median, not population norms

Every deviation Symetric flags is relative to **that user's own history**, never a population norm, an age/sex-adjusted range, or anything looked up externally. There is no "normal" range in this system — only "normal for you, recently."

**Computation** (`src/lib/baseline/rollingBaselineRecalc.ts`, `src/lib/baseline/stats.ts`):
- Baseline = **median** of a domain's scores over the trailing 30 days, requiring at least 14 distinct days and 14 non-null scores in that window.
- Median, not mean, deliberately — a mean gets dragged by a single terrible flare day; a median mostly ignores it. For a chronic-illness population where "one very bad day" is a routine, expected event rather than a rare outlier, this matters.
- `baseline_variability` (population standard deviation, σ) is computed alongside the median but is not currently surfaced anywhere in the product — it exists as a dispersion measure for future use, not a shown metric.
- Recalculated weekly, client-triggered on app open (not a background job) — so a baseline can be up to ~7 days stale for an active user, and arbitrarily stale for an inactive one. Documented in code as a known, accepted tradeoff, not a bug.
- **Precedence**: a user's very first baseline per domain comes from their own self-rating during onboarding (`source: 'onboarding'`). Once 14+ days of real check-in data exist, the rolling median takes over as the "current" baseline for that domain; the onboarding value is kept in the table for history but stops being used.

---

## 3. The core primitive: flagging a deviated day

Nearly everything downstream — sustained patterns, volatility, cycling — starts from the same per-day, per-domain check (`src/lib/clusterDetection.ts`):

1. Take that day's average score for a domain (mean of however many check-ins landed that day).
2. Compare it to a **short-term baseline**: the median of the last 14 days of that domain's own history if there's enough recent history, otherwise falling back to the longer-run baseline from §2 (or a hardcoded default of 5, or 3 for sleep, if neither exists yet).
3. If `|today's value − baseline| ≥ 2` (on the app's 1–10 scale), that day is flagged **elevated** or **depressed** for that domain.

Everything in §4 is different ways of asking "what shape do these flagged days make?"

---

## 4. Pattern types, and the exact thresholds that define each one

| Pattern | What it requires | Where |
|---|---|---|
| **Sustained deviation** | ≥3 consecutive flagged days (same domain, same direction) | `clusterDetection.ts` |
| **Intraday volatility** | Same-day swing ≥4 points across that day's check-ins (max − min) | `clusterShapeDetectors.ts` → `detectIntradayVolatility` |
| **Rapid cycling** (mood only, currently) | ≥3 direction switches within a 7-day rolling window, each swing ≥2 points from baseline | `clusterShapeDetectors.ts` → `detectWeeklyOscillations` |
| **Circadian time-of-day pattern** | ≥30 check-ins for that domain, spanning ≥3 weeks and ≥10 distinct days; highest vs. lowest time-block average differs by ≥2.0 points | `circadianDetection.ts` |

A few notes worth being precise about:

- **Severity** for a sustained deviation or rapid-cycling pattern is `streak length (or switch count) × mean deviation magnitude` — a simple duration-weighted magnitude score, not a clinical severity scale of any kind.
- **Circadian blocks are relative, not clock-time.** "Morning/midday/afternoon/evening" are the user's own active window split into four equal-percentage quarters — someone whose window is 6am–2pm and someone whose window is 12pm–10pm get differently-timed blocks, which keeps the comparison meaningful for that person's actual day rather than assuming everyone's day looks the same.
- **A streak survives missed check-in days** as long as the days that *do* have data keep landing on the same side of the flag — a day with zero data is skipped, not treated as "returned to baseline." This is a deliberate tradeoff (missed logging shouldn't silently erase a real pattern) that also means streak length isn't quite the same thing as calendar-day duration; the data-quality gate in §5 exists specifically to catch the case where this tradeoff would otherwise let a sparse, unreliable streak through.

---

## 5. Data quality gating — patterns can be rejected, not just detected

Before any pattern is written to the database, it has to clear a coverage check. If it doesn't, **it is discarded entirely** — Symetric does not show a pattern it isn't confident enough actually happened. (`src/lib/detection/dataQualityChecks.ts`)

| Pattern | Rejected if | Quality tiers (once accepted) |
|---|---|---|
| Sustained deviation | Coverage <40% of expected check-ins, or <1.5 check-ins/day average | Solid ≥75% coverage & ≥2/day · Partial ≥50% · Limited 40–49% |
| Rapid cycling | Data on <5 of the 7 window days, or any gap >2 consecutive missing days | Solid ≥85% coverage · Partial otherwise |
| Circadian | <30 total check-ins, <10 distinct days, <3 weeks of span, or any populated time block with <5 points | Solid only (anything below the floor is rejected outright, not downgraded) |

The resulting tier (`solid` / `partial` / `limited`) is **internal only** — never shown as a raw label or percentage — but it does two real things: it can suppress a pattern from ever surfacing, and it discounts a pattern's priority score (§7) if it's shown at all.

### One-tap check-ins cannot carry a finding on their own

Comfort mode offers a one-tap "Nothing unusual today" in place of the full slider form. Those check-ins are real data, not skips — every slider already rests at that domain's own baseline, so a one-tap records *typical for me* rather than a guess — and they are stored with `check_ins.low_demand = true`.

They count toward coverage, because they genuinely are data points. But a sustained deviation whose window is **more than half** one-tap entries is capped at `partial`, never `solid`. The reason is a false-negative risk, not a false-positive one: a stretch of one-taps logged during a real flare would record baseline values and read as calm, so the deliberate entries in that window have to be the ones carrying the finding. Mind check-ins only — body check-ins have no one-tap path.

---

## 6. Correlation: Pearson's r, computed properly — with a real p-value

This is the one place Symetric runs inferential statistics, not just descriptive comparisons. (`src/lib/detection/computeConnection.ts`, `src/lib/detection/domainConnections.ts`, `src/lib/detection/bodyMindConnections.ts`)

- **Pearson's r** is computed the standard way — covariance of the two series divided by the product of their standard deviations.
- **A real p-value accompanies it.** The code implements the regularized incomplete beta function (via a Lentz continued-fraction expansion, plus a Lanczos approximation for the log-gamma function it depends on) to compute the two-tailed significance of r against Student's t-distribution with `n − 2` degrees of freedom. This is genuine hypothesis testing, not a home-grown heuristic — the same test a standard stats package would run for a Pearson correlation.
- **Thresholds before anything is reported at all**: minimum 14 overlapping data points, `|r| ≥ 0.6` **and** `p ≤ 0.05`. Below that, the pair is treated as having no detectable relationship.
- **Confidence tiers**: `|r| ≥ 0.7` and `p ≤ 0.01` → reported as "clear"; anything meeting the base threshold but not that → "tentative."
- **The raw r-value and p-value are never shown to the user** — this is an explicit, commented compliance rule in the code, not an oversight. The UI only ever surfaces a qualitative direction ("tend to move together") and confidence label. This avoids two real failure modes: a lay reader misreading a raw r as a percentage or a probability, and the appearance of a precise clinical measurement where what actually exists is a threshold-gated pattern in one person's self-reported history.
- **Two correlation grains, kept deliberately separate**: mind-domain pairs (mood, energy, anxiety, etc.) are correlated on **raw, same-day check-ins** — multiple readings per day, not averaged first — because they share that intraday granularity. Body domains are logged once daily, so body×mind and body×body pairs are correlated on **daily averages** instead, in a separate detector, specifically so the two methods never produce two different numbers for what should be the same underlying relationship.
- **Consistency tracking**: a detected connection is flagged `consistent_pattern: true` if the same domain pair showed the same direction and a similar |r| (within 0.15) in the *previous* 30-day window too — a lightweight replication check across time, within one person's own data.

**Sleep is handled differently, deliberately** (`sleepConnections.ts`): rather than correlating a continuous sleep score against a domain, it's a **mean-difference comparison** — average domain score on good-sleep days (felt-rested ≥4, or ≥21 sleep logs and ≥5 days in each group) vs. poor-sleep days (≤2), flagged as "affected by sleep" if the two group averages differ by ≥1.5 points. This is closer to a simple two-group comparison than a correlation, chosen because the question being asked ("does this get worse after bad sleep nights") is naturally binary, not "how linearly does this track with sleep quality."

---

## 7. Why multi-domain patterns get shown first: the priority score

This is the piece that answers "importance of different domains in identifying clusters" most directly — and it's worth being exact about what this scoring *is* and *isn't*.

**What it is**: a deterministic, fully inspectable weighted formula (`src/utils/priorityScoring.ts`) that decides **display order** in Insights — which detected pattern a user sees first. Multi-domain patterns are weighted up specifically:

| Factor | Weight effect |
|---|---|
| Pattern touches ≥3 domains | +1.5 |
| Pattern touches 2 domains | +0.8 |
| Sustained deviation, ≥21 days | +1.2 (≥14 days: +0.8 · ≥7 days: +0.4) |
| Ongoing (not yet resolved) | +0.5 |
| Intraday swing ≥7 points | +1.0 (≥5: +0.5) |
| Rapid cycling | +1.3 |
| Elevated despite poor sleep (energy-specific differential marker) | +1.5 |
| Improved with sleep | +0.6 |
| Severity score | multiplies the running total (normalized around 1.0 at severity ≈5, capped at 3×) |
| Partial data quality | ×0.8 |
| Limited data quality | ×0.6 |

The reasoning behind weighting multi-domain co-occurrence higher is straightforward differential-diagnosis logic, not a statistical inference: **a shift that shows up across several systems at once (say, mood, energy, and a body domain moving together) is more likely to reflect something real and worth a clinician's attention than an isolated one-domain blip** — the same intuition behind why a clinician cares more about a cluster of symptoms than any single one in isolation. The "elevated energy despite poor sleep" bonus exists for the same reason in miniature: it's a named differential marker (relevant to conditions where elevated energy on insufficient sleep is itself a meaningful signal) rather than a generic threshold crossing.

**What it is not**: this is not machine-learned feature importance, and it doesn't claim any domain is medically "more important" than another in general. It's a transparent, hand-authored scoring function operating only on patterns *already detected* by §4–6 — it never decides whether a pattern exists, only how it's ordered once it does. Nothing here is trained on outcomes, other users, or anything beyond the arithmetic in the table above.

---

## 8. What this can and can't tell you

Worth stating as plainly on a methodology page as anywhere else in the product:

- **Nothing here is a diagnosis, a risk score, or a clinical measurement.** Every threshold above is a pattern-matching rule over one person's own recent history, chosen to be conservative (data-quality gates exist specifically to suppress unreliable patterns rather than show them anyway).
- **Correlation is not causation**, and the product doesn't claim otherwise — the UI language ("tend to move together") is deliberately non-causal, and the underlying r/p values are withheld specifically so they can't be mistaken for something more definitive than they are.
- **All of it depends on logging adherence.** A pattern that's real but under-logged will be suppressed by the data-quality gates in §5 rather than shown with false confidence — meaning Symetric is tuned to under-report rather than over-report, which is the right failure direction for something that might end up in a doctor's hands, but does mean sparse trackers will see fewer patterns, not lower-confidence ones.
- **Everything is single-subject.** There is no comparison to other users, no population baseline, no epidemiological data anywhere in this pipeline — every number in this document is computed from, and compared against, one person's own logged history and nothing else.

---

## Reference: every constant in one place

| Constant | Value | Source |
|---|---|---|
| Deviation flag threshold | ≥2 points from baseline | `clusterDetection.ts` |
| Sustained deviation streak | ≥3 consecutive flagged days | `clusterDetection.ts` |
| Intraday volatility swing | ≥4 points same-day | `clusterShapeDetectors.ts` |
| Rapid cycling switches | ≥3 in a 7-day window | `clusterShapeDetectors.ts` |
| Circadian range threshold | ≥2.0 points, highest vs. lowest block | `circadianDetection.ts` |
| Circadian minimum data | ≥30 check-ins, ≥10 days, ≥3 weeks span, ≥5 pts/populated block | `dataQualityChecks.ts` |
| Rolling baseline window | 30 days, min. 14 days/scores | `rollingBaselineRecalc.ts` |
| Correlation minimum overlap | 14 paired data points | `computeConnection.ts` |
| Correlation reporting threshold | \|r\| ≥ 0.6 and p ≤ 0.05 | `computeConnection.ts` |
| Correlation "clear" confidence | \|r\| ≥ 0.7 and p ≤ 0.01 | `computeConnection.ts` |
| Correlation consistency tolerance | \|Δr\| ≤ 0.15 vs. prior window | `domainConnections.ts` |
| Sleep-effect group minimums | ≥21 sleep logs; ≥5 days per group (≥2 for in-cluster check) | `sleepConnections.ts`, `clusterDetection.ts` |
| Sleep-effect threshold | ≥1.5 point group difference | `sleepConnections.ts` |
| Sustained deviation coverage floor | ≥40% coverage, ≥1.5 check-ins/day | `dataQualityChecks.ts` |
| Rapid cycling coverage floor | ≥5/7 days with data, no gap >2 days | `dataQualityChecks.ts` |
