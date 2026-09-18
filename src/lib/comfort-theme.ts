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
 * contrast and take the shout out of the accents. The bright indigo call to
 * action, the tracked-out accent eyebrow and the lit card borders are what make
 * the screen loud; #e2e8f0 on #0a0c12 is what makes it readable.
 */

export interface ComfortTokens {
  /** Filled button background. White text sits on this. */
  accent: string;
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

const NORMAL_ACCENT = '#4f46e5';
const NORMAL_ACCENT_TEXT = '#818cf8';
const NORMAL_ACCENT_BORDER = '#3730a3';

// Same hues, dropped chroma and lightness. White on #3f3d6b clears 8:1, so the
// CTA is still unmistakably a button — it just stops being the brightest thing
// in the room.
const QUIET_ACCENT = '#3f3d6b';
const QUIET_ACCENT_TEXT = '#a5abc9';
const QUIET_ACCENT_BORDER = '#252a44';

/** Chosen to be legible-but-not-disruptive: enough to matter, small enough that
 *  the check-in flow's existing boxes hold it without reflowing to nonsense.
 *  The OS setting (Linking.openSettings) is still the answer for a real
 *  low-vision need, and it already works — nothing in this app sets
 *  allowFontScaling={false}. */
const COMFORT_SCALE = 1.15;

const identity = (size: number) => size;
const scaled = (size: number) => Math.round(size * COMFORT_SCALE * 2) / 2;

export const NORMAL_TOKENS: ComfortTokens = {
  accent: NORMAL_ACCENT,
  accentText: NORMAL_ACCENT_TEXT,
  accentBorder: NORMAL_ACCENT_BORDER,
  scale: 1,
  fs: identity,
};

export const COMFORT_TOKENS: ComfortTokens = {
  accent: QUIET_ACCENT,
  accentText: QUIET_ACCENT_TEXT,
  accentBorder: QUIET_ACCENT_BORDER,
  scale: COMFORT_SCALE,
  fs: scaled,
};
