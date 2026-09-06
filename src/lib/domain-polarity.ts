// ── Domain polarity ─────────────────────────────────────────────────────────
// Which way is "bad" for each tracked factor, and the one thing that depends
// on it: how a correlation's direction is worded.
//
// Correlations are computed — and persisted, in domain_connections.
// moves_together — on raw scores. Raw is the right thing to store: it's what
// the maths produced, and it stays meaningful if a domain's scale is ever
// reworded. But it is the wrong thing to *say*, because the domains don't all
// score the same way round. Energy scores 0-4 with 4 being a good day; end of
// day exhaustion scores 0-4 with 4 being a bad one. A day with low energy and
// high exhaustion is one bad day showing up twice, yet the raw coefficient is
// negative, and the app used to describe that as the two "moving in opposite
// directions" — the exact opposite of what the reader lived.
//
// So: raw direction for storage and maths, reader direction for sentences.
// Anything that words a relationship to a person goes through
// movesTogetherForReader; anything that computes with it does not.

import { BODY_DOMAINS } from '@/lib/body/constants';

/** Mind domains that measure a burden rather than a resource — scoring high on
 *  these is a worse day, the same way it is for every body domain. The rest of
 *  the mind domains (mood, energy, concentration, motivation) and sleep score
 *  the other way round: high is good. */
const HIGHER_IS_WORSE_MIND_DOMAINS = new Set([
  'anxiety',
  'irritability',
  'social_battery',
  'sensory_sensitivity',
]);

/** True when a higher score on this factor means a worse day. Accepts any
 *  tracked factor — mind domain, body domain, or 'sleep'. Unknown factors are
 *  treated as higher-is-better, matching the mind-domain default. */
export function higherIsWorse(factor: string): boolean {
  if (factor === 'sleep') return false;
  if (factor in BODY_DOMAINS) return true;
  return HIGHER_IS_WORSE_MIND_DOMAINS.has(factor);
}

/**
 * Restates a raw-score correlation direction the way the reader experienced
 * it. `movesTogetherRaw` is the stored direction — both scores rose together.
 * The result is whether the two factors got better and worse in step.
 *
 * When both factors score the same way round the two agree. When they score
 * opposite ways round — energy and exhaustion, sleep and pain — the reader
 * direction is the inverse of the raw one.
 */
export function movesTogetherForReader(
  factorA: string,
  factorB: string,
  movesTogetherRaw: boolean,
): boolean {
  return movesTogetherRaw === (higherIsWorse(factorA) === higherIsWorse(factorB));
}
