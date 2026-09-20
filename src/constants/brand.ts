// The app's own colour, in one place.
//
// This was previously 180 literals spread across 54 files: 137 hex values and
// 43 rgba() tints of the same handful of purples. That made the brand colour
// impossible to change without a sweep that could not distinguish chrome from
// data — and the accent shares its hex with a domain, so a sweep was exactly
// the wrong tool.
//
// ── Why teal, and why these exact values ───────────────────────────────────
//
// The accent used to be #818cf8, which is also DOMAIN_COLORS.mood — the same
// hex, not a near miss. Every link and active label in the app was painted
// the colour that means Mood on every chart. Mood keeps the purple; the app
// moved.
//
// `fill` is #0F6E56 because that is already theme.colors.teal in the PDF
// report, where it means "improved". Sharing the ink means the app and the
// document it produces stop being two different brands.
//
// Distances were measured rather than eyeballed. The fill sits dE 42 from
// the nearest data colour and the link text dE 27 from Energy, the closest
// green; anything under 15 would be confusable at a glance. Contrast holds
// in both directions: white on `fill` is 6.2:1 (the purple managed 6.3), and
// `text` on the near-black background is 10.5:1 (the purple, 6.6).
//
// Data colours (DOMAIN_COLORS, BODY_COLOR) are a separate system and do not
// belong in this file. If you are reaching for a colour to identify a
// measurement, you want lib/domains.ts.

export const BRAND = {
  /** Primary button fill, under a white label. */
  fill: '#0F6E56',
  /** Gradient partner and secondary fills. */
  fillAlt: '#15887A',
  /** Links, icons, active labels on the dark background. */
  text: '#4FD1C5',
  /** Lighter accent text, for larger or lower-emphasis type. */
  textSoft: '#99E6DB',
  /** The settings-screen accent, a touch flatter than `text`. */
  textFlat: '#3FB8A8',
  /** Accent card borders. */
  border: '#1A5C4E',
  /** Accent card background — a near-black with the accent's hue in it. */
  surface: '#0B1A1B',
  /** The sign-in button, which has always been its own shade. */
  signIn: '#0F7A60',
  /** The logo tile behind the mark. The mark's own gradient is built from the
   *  domain colours and is not a brand colour — see symetric-logo.tsx. */
  tile: '#0B2B2A',
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
