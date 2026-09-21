// The three accents the user can choose between, and the roles each one has
// to fill.
//
// ── Why this is a choice at all ────────────────────────────────────────────
//
// Symetric is used by people managing a chronic illness, often daily, often
// when they feel bad. The one piece of the interface that is purely taste —
// what colour the chrome is — costs nothing to hand over, and comfort mode
// already establishes that this app lets you turn its volume down.
//
// Porcelain is the default because it is the only option that cannot collide
// with a data colour under any circumstance: it has no hue to collide with.
// That matters more here than in most apps. Every chart in Symetric makes a
// claim through colour about *which measurement* you are looking at, and the
// accent sitting next to those charts is the one colour on screen that means
// nothing. A near-white button is unambiguously chrome.
//
// ── Why each accent is a whole family, not a hex ───────────────────────────
//
// An accent has to be legible in two opposite directions — as coloured text
// on a near-black background, and underneath a label when it fills a button —
// and no single value does both. Every family below therefore carries its own
// `onFill`, because porcelain takes a near-black label where teal and plum
// take white. Swapping a single hex would have produced white-on-porcelain at
// 1.3:1, which is invisible.
//
// ── Where the values come from ─────────────────────────────────────────────
//
// Measured, not eyeballed. scripts/check-accents.mjs asserts every floor in
// this file and fails the build if one slips:
//
//   - accent text on #0a0c12 clears 4.5:1 (3:1 for `textSoft`, which is only
//     used at larger sizes)
//   - the paired label on every fill clears 4.5:1
//   - no accent colour lands within dE 15 of any domain colour, or the app's
//     chrome would be making a claim about a measurement
//   - no accent text lands within dE 15 of body text #e2e8f0, or a link stops
//     looking like a link
//
// That last check is the reason porcelain's `text` is #C8B79A rather than the
// #D6CFC2 on the original option sheet: the off-white measured dE 14.6 from
// body text, so every link in the app would have read as ordinary prose.
//
// Data colours (DOMAIN_COLORS, BODY_COLOR) are a separate system and are not
// in this file. See lib/domains.ts, and the one rule in docs/brand.md.

export type AccentName = 'porcelain' | 'teal' | 'plum';

/** Quieter versions of the accent roles, for comfort mode. Same hue, chroma
 *  and lightness pulled back, so the call to action stops being the brightest
 *  thing on the screen without stopping being a button. */
export interface QuietTokens {
  /** Filled button background. */
  fill: string;
  /** The label on that fill. */
  onFill: string;
  /** Accent-coloured text — eyebrows, values, links. */
  text: string;
  /** Lit card borders. */
  border: string;
}

export interface AccentTokens {
  /** Primary button fill. */
  fill: string;
  /**
   * The label colour that sits on `fill`, `fillAlt` and `signIn`.
   *
   * Not always white. Porcelain is a light button and takes a near-black
   * label; white on it is 1.3:1. Anywhere a label sits on an accent fill it
   * must read this token rather than hard-coding '#ffffff' — that was true in
   * 24 places before this existed.
   */
  onFill: string;
  /** Gradient partner and secondary fills. */
  fillAlt: string;
  /** Links, icons, active labels on the dark background. */
  text: string;
  /** Lighter accent text, for larger or lower-emphasis type. */
  textSoft: string;
  /** A flatter accent text, for settings rows and inline links. */
  textFlat: string;
  /** Accent card borders. */
  border: string;
  /** Accent card background — a near-black with the accent's hue in it. */
  surface: string;
  /** The sign-in button, which has always been its own shade. */
  signIn: string;
  /** The logo tile behind the mark, in-app. The mark's own gradient is built
   *  from the domain colours and never changes — see symetric-logo.tsx. */
  tile: string;
  /** Comfort mode's quieter set. */
  quiet: QuietTokens;
}

export const ACCENTS: Record<AccentName, AccentTokens> = {
  // A warm neutral. The fill is near-white with a near-black label, which is
  // why it is the only accent that inverts. `text` is a warm stone rather
  // than the fill's own off-white, so links stay distinguishable from prose.
  porcelain: {
    fill: '#E7E2D9',
    onFill: '#0A0C12',
    fillAlt: '#CFC7B6',
    text: '#C8B79A',
    textSoft: '#DACEB8',
    textFlat: '#B5A386',
    border: '#3A3229',
    surface: '#14120E',
    signIn: '#EFEBE3',
    tile: '#2A251C',
    quiet: { fill: '#BDB4A5', onFill: '#0A0C12', text: '#A99C86', border: '#2E2921' },
  },

  // The accent that shipped in 1.4.0, kept intact so choosing it returns the
  // app to exactly what it looked like. `fill` is also theme.colors.teal in
  // the PDF report, where it means "improved".
  //
  // #0F6E56 rather than the #0D6E66 on the original option sheet: the two are
  // dE 10 apart, which is under the 15 that makes colours distinguishable, and
  // this value is the one already measured, shipped and shared with the report.
  teal: {
    fill: '#0F6E56',
    onFill: '#FFFFFF',
    // Darkened from the 1.4.0 #15887A: white on that was 4.34:1, which misses
    // AA for a 14px button label. This clears it at 4.83:1. The five places
    // that were using fillAlt as *text* moved to textFlat, which is what they
    // always meant — fillAlt was quietly doing both jobs and failing one.
    fillAlt: '#13806F',
    text: '#4FD1C5',
    textSoft: '#99E6DB',
    textFlat: '#3FB8A8',
    border: '#1A5C4E',
    surface: '#0B1A1B',
    signIn: '#0F7A60',
    tile: '#0B2B2A',
    quiet: { fill: '#2F5450', onFill: '#FFFFFF', text: '#9FC3BB', border: '#1E3330' },
  },

  // The richest of the three, and the only one with a purple lineage — which
  // is the point, for anyone who liked the old indigo. It sits dE 26 from
  // Social depletion, the nearest domain colour, so it is nobody's data.
  plum: {
    fill: '#7A1A82',
    onFill: '#FFFFFF',
    fillAlt: '#9B2BA4',
    text: '#DDA0E8',
    textSoft: '#EFC9F5',
    textFlat: '#C888D4',
    border: '#4E1454',
    surface: '#170B1A',
    signIn: '#85208D',
    tile: '#2B0F30',
    quiet: { fill: '#53275A', onFill: '#FFFFFF', text: '#BA9CC4', border: '#33203A' },
  },
};

/** Stable order for the picker, and for anything that builds one style sheet
 *  per accent. Porcelain first because it is the default. */
export const ACCENT_NAMES = ['porcelain', 'teal', 'plum'] as const;

/**
 * What the app is if nobody has chosen.
 *
 * Also what the *build-time* assets are painted with — the launcher icon, the
 * splash and the Android notification tint are baked into app.json and cannot
 * follow a runtime preference. Changing this constant without regenerating
 * those (scripts/make-icons.mjs) leaves the home screen wearing the old brand.
 */
export const DEFAULT_ACCENT: AccentName = 'porcelain';

/** Short labels for the Settings picker. */
export const ACCENT_LABELS: Record<AccentName, string> = {
  porcelain: 'Porcelain',
  teal: 'Teal',
  plum: 'Plum',
};

/** One line each, describing the colour rather than selling it. */
export const ACCENT_DESCRIPTIONS: Record<AccentName, string> = {
  porcelain: 'Warm off-white. The quietest of the three.',
  teal: 'The original. Matches the colour the PDF report uses for improvement.',
  plum: 'Deep purple. The most colour of the three.',
};

/** Narrows anything read back from the database. An unknown value — an older
 *  app meeting a newer column, or a hand-edited row — falls back rather than
 *  rendering undefined tokens. */
export function toAccentName(value: unknown): AccentName {
  return typeof value === 'string' && value in ACCENTS ? (value as AccentName) : DEFAULT_ACCENT;
}
