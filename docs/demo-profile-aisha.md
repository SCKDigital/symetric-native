# Demo profile: Aisha — spec for a sample report

**Purpose**: A synthetic 90-day dataset designed to make a demo PDF report (`generateReport.ts`) show something real — at least one finding on every page — without inventing anything the detection code in `docs/methodology.md` wouldn't actually produce. Not yet built; this is the data spec to seed, by hand or by script.

**Design rule**: the profile has to embody Symetric's own pitch, not undercut it. That means picking a *curated* set of domains, not all of them — a demo that tracks all 8 mind domains "to show everything off" would quietly prove Bearable's point instead of Symetric's.

---

## Who Aisha is, for this profile

29, with **one confirmed diagnosis and two suspected ones still in the queue** — deliberately weighted toward "not yet sorted" rather than "fully diagnosed," because that's the more common and more honest state for this cluster, and it's the exact case the "you don't need a diagnosis to start" website copy is written for:

- **Generalised anxiety — diagnosed**, on medication, the one condition with an actual paper trail.
- **ADHD — suspected, self-recognised, on a public waitlist for formal assessment.** Common pattern for women diagnosed (or not yet) in adulthood — exactly the underdiagnosed-in-women population named in `marketing/who-this-is-for.md`.
- **POTS — suspected**, GP has noted it, referral to cardiology for a tilt-table test is pending. No formal diagnosis yet, but a GP has empirically trialled a low-dose beta-blocker in the meantime, which is realistic — that trial doesn't require the diagnosis to exist first.
- **Hypermobile EDS — suspected**, informally Beighton-scored by a GP, referral to a hypermobility clinic pending. Physio has been started in the meantime, again ahead of formal diagnosis.

No MCAS in this version — dropped from the previous draft, which keeps the profile tighter and avoids stacking a fourth uncertain condition onto three already-uncertain ones.

**Non-diagnostic caution, worth restating for this version specifically**: with three of the four conditions unconfirmed, it would be very easy for a demo report to slip into reading as if it's pattern-matching toward a diagnosis ("this looks like ADHD," "this looks like POTS"). It must not. Every finding stays purely descriptive — a domain moved, two domains moved together, a marker preceded a change — never an interpretation of what that means clinically. That restraint is itself part of what the demo needs to demonstrate.

This still maps directly onto the app's body domains and events, just re-pointed at the new condition mix:

| App concept | Aisha's condition it represents |
|---|---|
| `orthostatic` domain, `presyncope` event | Suspected POTS |
| `joint_instability` domain, `subluxation` event, `pain_mechanical` | Suspected hypermobile EDS |
| `concentration`, `sensory_sensitivity` (mind domains) | Suspected ADHD |
| `anxiety`, `mood` (mind domains) | Diagnosed anxiety |
| `gut` domain | General dysautonomia-linked GI symptoms — tracked descriptively, not framed as evidence of anything specific |
| `migraine_onset` event | Migraine (longstanding, already-familiar) |
| `crash_onset` event | Post-exertional crash (common across this cluster) |
| `palpitations` event | Suspected POTS / general dysautonomia |

## Mind domains: 5, not 8

`mood`, `energy`, `anxiety`, `concentration`, `sensory_sensitivity`.

The set is unchanged from the first draft, but the reasoning behind two of them shifts with the new condition mix: `concentration` and `sensory_sensitivity` now earn their place primarily as the suspected-ADHD axis (executive function and sensory overwhelm), not MCAS. `anxiety` and `mood` map to the one confirmed diagnosis. `energy` covers the general fatigue axis shared across all four conditions. Left out deliberately: `irritability`, `social_battery`, `motivation` — `social_battery` remains the next most defensible addition if a richer demo is wanted later, but resist adding all 8 just to show the ceiling.

## Body domains: all 8

This persona plausibly wants everything the body check-in offers — `fatigue`, `pain_mechanical`, `pain_widespread`, `joint_instability`, `breathlessness`, `orthostatic`, `gut`, `exhaustion` — because the domain list was clearly built around exactly this comorbidity cluster already. Body events to include: `subluxation`, `presyncope`, `migraine_onset`, `crash_onset`, `palpitations`. **Drop `reaction`** (flushing/hives/sudden-gut-upset — an MCAS-coded event type) now that MCAS isn't part of the profile; `gut` symptoms are still tracked, just as a plain domain score rather than discrete reaction episodes. Leave out `injury` unless one one-off incident is wanted for texture.

## Body pain sites

A handful of `BodyMap` logs at classic hypermobile-EDS joints — knee, shoulder, wrist — rather than scattered everywhere. Specific, not exhaustive, is more credible.

---

## Timeframe & adherence

**90 days** — matches the detection window every pattern type in `docs/methodology.md` uses. **~80% check-in adherence, not 100%** — a perfectly-logged demo dataset would never trigger the `partial` data-quality tier, and showing that tier working honestly (a pattern that gets shown with appropriately hedged confidence, or correctly suppressed) is a better demo of the product than a suspiciously clean one.

---

## The narrative arc — three intervention markers, one condition deliberately untouched

This is what makes Page 2's numbered intervention markers mean something, instead of sitting on an empty chart — and with only one confirmed diagnosis this time, it's worth being deliberate about which conditions *get* a marker and which don't.

1. **Medication marker (~day 20) — anxiety, the one confirmed diagnosis**: a dose increase on existing anxiety medication. Engineer a real, gradual improvement afterward in `anxiety`, `mood`, and `sensory_sensitivity`. This is the strongest, least speculative example in the whole demo — there's nothing suspected about it, so it's the one marker that should show the cleanest before/after effect.
2. **Life-event marker (~day 45) — the ADHD assessment referral letter arriving**: a genuinely activating event even though it's "good news" (a step toward an answer). Triggers a ~10–14 day multi-domain flare — `anxiety`, `concentration`, and `gut` moving together, with `energy` dragged down alongside them. This is the one that should land as a **sustained deviation cluster spanning 3+ domains**, which `priorityScoring.ts` weights highest (+1.5 for 3+ domains) — the report's top finding should be this one, not a coincidence. It also does double duty: the flare itself becomes a data point relevant to the pending ADHD assessment, without the report ever framing it that way.
3. **Therapy marker (~day 65) — hypermobility physio, started ahead of a formal EDS diagnosis**: give it a slow, partial effect on `joint_instability` and `pain_mechanical` — improvement, but gradual and incomplete.

**POTS gets no marker at all, on purpose.** It's the condition furthest from being addressed — GP-suspected, cardiology referral still pending, only a beta-blocker trial in the background that isn't framed as a resolving intervention. Its pattern (see circadian, below) should just sit there in the report, present and real, with nothing yet done about it. That's not a gap in the demo — it's the most honest beat in it: proof the report surfaces what's true even when nobody's acted on it yet.

---

## Patterns to engineer on purpose

Each of these should be *actually true* in the synthetic numbers, not just claimed — the report only shows what the real thresholds in `docs/methodology.md` would detect:

- **Sustained deviation** (the referral-letter flare, §above) — the headline finding.
- **Correlation**: `anxiety` ↔ `gut` moving together — still clinically well-established independent of any MCAS framing (the anxiety-gut axis holds regardless), build it to land around r≈0.7+ with ≥14 overlapping points, so it clears the "clear" confidence bar. Worth also engineering a secondary, gentler one: `anxiety` ↔ `concentration` moving inversely (concentration drops as anxiety spikes) — a plausible, purely descriptive pattern that happens to be relevant to the pending ADHD assessment without the report saying so.
- **Sleep effect**: `fatigue` and `concentration` meaningfully worse after poor-sleep nights (≥1.5-point group difference) — put one deliberate poor-sleep stretch during the flare window so the two findings reinforce each other.
- **Circadian pattern**: `orthostatic` and `energy` worst in the morning block, best in the afternoon — true to how POTS actually presents (worse on first standing). This is the pattern tied to the untouched condition above — let it be a real, clearly-shown finding with no marker anywhere near it.
- **Intraday volatility**: at least one flagged high-swing day, timed to a `presyncope` event — energy crashing within the same day rather than gradually.
- **One deliberately partial-quality finding**, from a lower-adherence stretch — proof the system is honest about its own confidence rather than only ever showing clean green patterns.

---

## Context info beyond the numbers

- `userName`: "Aisha"
- `activeDomains`: the 5 mind domains above
- **1–2 pattern reviews** (`patternReviews`) marked `should_discuss: true`, with a short real-sounding `user_note` — e.g., on the referral-letter cluster: *"started the week the ADHD assessment letter came — couldn't focus at all and the stomach thing came back."* This is the single most on-brand piece of the whole demo: it's the moment the report stops being a chart and becomes evidence for a specific conversation with a specific doctor, which is the entire reason Aisha logs anything at all.
- **1–2 generated Prepare questions** tied to that same cluster, so Page 2/5's doctor-conversation framing has something concrete behind it rather than a placeholder.

---

## Next step, if wanted

This spec is enough to hand-build the rows directly in Supabase, or to write a seed script that generates 90 days of `check_ins` / `body_checkins` / `sleep_logs` / `body_events` / `markers` numerically shaped to hit the thresholds above. Not built yet — say the word and I'll write the seed script next, either as a one-off SQL/JS script or wired into a dev-only "load demo data" path.
