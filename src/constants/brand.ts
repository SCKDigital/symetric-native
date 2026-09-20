// The app's own colour, in one place.
//
// This was previously 180 literals spread across 54 files: 137 hex values and
// 43 rgba() tints of the same handful of purples. That made the brand colour
// impossible to change without a sweep that could not distinguish chrome from
// data — and the accent shares its hex with a domain, so a sweep was exactly
// the wrong tool.
//
// ── The collision worth knowing about ──────────────────────────────────────
//
// `text` below is #818cf8, and so is DOMAIN_COLORS.mood in lib/domains.ts.
// Identical, not similar. Every link and active label in the app is painted
// the colour that also means Mood on every chart. That is why the literal in
// domains.ts is deliberately NOT imported from here: the two are the same
// value today by accident, and must be free to diverge. Do not "tidy" it by
// pointing Mood at BRAND.text.
//
// Data colours (DOMAIN_COLORS, BODY_COLOR) are a separate system and do not
// belong in this file. If you are reaching for a colour to identify a
// measurement, you want lib/domains.ts.

export const BRAND = {
  /** Primary button fill, under a white label. */
  fill: '#4f46e5',
  /** Gradient partner and secondary fills. */
  fillAlt: '#6366f1',
  /** Links, icons, active labels on the dark background. */
  text: '#818cf8',
  /** Lighter accent text, for larger or lower-emphasis type. */
  textSoft: '#a5b4fc',
  /** The settings-screen accent, a touch flatter than `text`. */
  textFlat: '#7b83f0',
  /** Accent card borders. */
  border: '#3730a3',
  /** Accent card background — a near-black with the accent's hue in it. */
  surface: '#12162b',
  /** The sign-in button, which has always been its own shade. */
  signIn: '#5d52e0',
  /** The logo tile behind the mark. The mark's own gradient is built from the
   *  domain colours and is not a brand colour — see symetric-logo.tsx. */
  tile: '#1E1B4B',
} as const;

/**
 * A translucent wash of a brand colour.
 *
 * The 43 rgba() literals this replaces were the reason a hex-only search and
 * replace would have left purple behind: every accent-tinted card background
 * and hairline border in the app was written as raw channel numbers, with no
 * textual link to the colour it was a tint of.
 */
export function brandTint(color: string, alpha: number): string {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
