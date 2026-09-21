// The app's own colour, in one place.
//
// This was previously 180 literals spread across 54 files: 137 hex values and
// 43 rgba() tints of the same handful of purples. That made the brand colour
// impossible to change without a sweep that could not distinguish chrome from
// data — and the accent shared its hex with a domain, so a sweep was exactly
// the wrong tool.
//
// ── This file is now the DEFAULT accent, not the only one ──────────────────
//
// As of 1.5.0 the accent is a user preference (profiles.accent) with three
// options, defined in constants/accents.ts. Anything that paints a screen
// reads the chosen one through `useAccent()` or `makeAccentStyles()`.
//
// BRAND remains for the two cases a runtime preference cannot reach:
//
//   1. Build-time assets. The launcher icon, the splash and the Android
//      notification tint are baked into app.json and the PNGs, so they wear
//      the default accent whatever the user picks.
//   2. Code that runs outside the React tree, where there is no context.
//
// If you are writing a component, you want useAccent().
//
// Data colours (DOMAIN_COLORS, BODY_COLOR) are a separate system and do not
// belong in this file. If you are reaching for a colour to identify a
// measurement, you want lib/domains.ts.

import { ACCENTS, DEFAULT_ACCENT } from '@/constants/accents';

export type { AccentName, AccentTokens, QuietTokens } from '@/constants/accents';

/**
 * The default accent's tokens.
 *
 * Porcelain since 1.5.0. Before that the default was teal, and before 1.4.0
 * it was #818cf8 — which was also DOMAIN_COLORS.mood, the same hex, so every
 * link and active label in the app was painted the colour that means Mood on
 * every chart. That is the mistake constants/accents.ts exists to stop
 * recurring, and part of why the default is now a colour with no hue at all.
 */
export const BRAND = ACCENTS[DEFAULT_ACCENT];

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
