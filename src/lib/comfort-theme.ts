import { ACCENTS, DEFAULT_ACCENT, type AccentTokens } from '@/constants/accents';

/**
 * The visual half of comfort mode: quieter accents and larger type.
 *
 * Not a port of the web app's comfort mode, which did `filter: brightness(0.85)`
 * over a near-black background. That dims the TEXT — the background is already
 * #0a0c12, so there is no glare to take off — and the result was lower contrast
 * sold as an accessibility feature. React Native has no equivalent filter on
 * every target anyway.
 *
 * What the web version was reaching for is here instead: hold body text at full
 * contrast and take the shout out of the accents. The bright call to action, the
 * tracked-out accent eyebrow and the lit card borders are what make the screen
 * loud; #e2e8f0 on #0a0c12 is what makes it readable.
 *
 * ── Why these are functions now ────────────────────────────────────────────
 *
 * They were two module-level constants, because there was one accent. Since
 * 1.5.0 the accent is a user preference with three options, so the quiet set
 * has to be derived from whichever one is on.
 *
 * Each accent carries its own `quiet` block in constants/accents.ts rather
 * than having one computed here by formula. Pulling chroma and lightness back
 * by a fixed ratio works for a saturated teal and falls apart for porcelain,
 * which is already near-white: it gets quieter by going *down* in lightness,
 * where the other two go down in chroma.
 */

export interface ComfortTokens {
  /** Filled button background. */
  accent: string;
  /** The label colour that sits on `accent`. Near-black under porcelain,
   *  white under the other two — never hard-code it. */
  accentOn: string;
  /** Accent-coloured text — eyebrows, values, links. */
  accentText: string;
  /** Lit card borders. */
  accentBorder: string;
  /** Multiplies a fontSize. 1 when comfort mode is off. */
  scale: number;
  /** fontSize helper — `fs(14)` in place of a bare 14. Rounded to a half point
   *  so line boxes stay on predictable positions. */
  fs: (size: number) => number;
}

/** Chosen to be legible-but-not-disruptive: enough to matter, small enough that
 *  the check-in flow's existing boxes hold it without reflowing to nonsense.
 *  The OS setting (Linking.openSettings) is still the answer for a real
 *  low-vision need, and it already works — nothing in this app sets
 *  allowFontScaling={false}. */
const COMFORT_SCALE = 1.15;

const identity = (size: number) => size;
const scaled = (size: number) => Math.round(size * COMFORT_SCALE * 2) / 2;

/** Comfort mode off: the chosen accent at full strength. */
export function normalTokens(accent: AccentTokens): ComfortTokens {
  return {
    accent: accent.fill,
    accentOn: accent.onFill,
    accentText: accent.text,
    accentBorder: accent.border,
    scale: 1,
    fs: identity,
  };
}

/** Comfort mode on: the same accent, turned down. */
export function comfortTokens(accent: AccentTokens): ComfortTokens {
  return {
    accent: accent.quiet.fill,
    accentOn: accent.quiet.onFill,
    accentText: accent.quiet.text,
    accentBorder: accent.quiet.border,
    scale: COMFORT_SCALE,
    fs: scaled,
  };
}

/**
 * The DEFAULT accent's sets, for the few places that need a comfort token
 * outside the React tree and so cannot read the context.
 *
 * A component should use `makeComfortStyles` or `useAccent()` instead. These
 * two are porcelain's, and will be the wrong colour for anyone who has chosen
 * teal or plum.
 */
export const NORMAL_TOKENS: ComfortTokens = normalTokens(ACCENTS[DEFAULT_ACCENT]);
export const COMFORT_TOKENS: ComfortTokens = comfortTokens(ACCENTS[DEFAULT_ACCENT]);
