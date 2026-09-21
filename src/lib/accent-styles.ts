import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { ACCENTS, ACCENT_NAMES, type AccentName, type AccentTokens } from '@/constants/accents';
import { useAccentName } from '@/contexts/accent-context';
import { comfortTokens, normalTokens, type ComfortTokens } from '@/lib/comfort-theme';

/**
 * Style sheets that follow the chosen accent.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 *
 * `StyleSheet.create({ color: BRAND.text })` reads BRAND once, when the module
 * is first imported, and keeps that value forever. 193 of the app's 224 accent
 * references were inside a module-scope create() call, so changing the accent
 * at runtime did nothing at all to them — the screens would have kept the
 * colour they were built with until the process restarted.
 *
 * ── The approach ───────────────────────────────────────────────────────────
 *
 * Build every sheet up front, one per accent, and pick between them at render.
 * Three sheets per file rather than one, created once at import.
 *
 * Eager rather than lazily cached on first use. A cache keyed by accent name
 * would save two thirds of the allocations for a user who never changes their
 * colour, at the cost of writing to a module-level Map during render — which
 * is a side effect in a render body, the thing the React Compiler exists to
 * object to. StyleSheet.create is close to identity in modern React Native, so
 * what is actually being saved is a few thousand small object literals, once,
 * at startup. Not worth the exception.
 *
 *     const useStyles = makeAccentStyles(b => ({
 *       link: { color: b.text },
 *     }));
 *
 *     function Thing() {
 *       const styles = useStyles();
 *       ...
 *     }
 *
 * The local has to be named `useSomething` for the rules-of-hooks lint to see
 * the call site as a hook call, which it is.
 */

type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function makeAccentStyles<T extends Styles>(factory: (accent: AccentTokens) => T): () => T {
  const byAccent = {} as Record<AccentName, T>;
  for (const name of ACCENT_NAMES) {
    byAccent[name] = StyleSheet.create(factory(ACCENTS[name]));
  }

  return function useAccentStyles(): T {
    return byAccent[useAccentName()];
  };
}

/**
 * The same, for the screens that also change under comfort mode.
 *
 * Six sheets: three accents times on and off. The factory gets the comfort
 * tokens it already took, plus the raw accent for the roles comfort mode does
 * not touch — `surface`, `fillAlt` and the rest, which stay put whether or not
 * the volume is turned down.
 *
 *     const useStyles = makeComfortStyles((t, b) => ({
 *       cta: { backgroundColor: t.accent },
 *       ctaText: { color: t.accentOn, fontSize: t.fs(17) },
 *       card: { backgroundColor: b.surface },
 *     }));
 *
 *     const styles = useStyles(comfortActive);
 */
export function makeComfortStyles<T extends Styles>(
  factory: (tokens: ComfortTokens, accent: AccentTokens) => T,
): (comfortActive: boolean) => T {
  const byAccent = {} as Record<AccentName, { normal: T; comfort: T }>;
  for (const name of ACCENT_NAMES) {
    const accent = ACCENTS[name];
    byAccent[name] = {
      normal: StyleSheet.create(factory(normalTokens(accent), accent)),
      comfort: StyleSheet.create(factory(comfortTokens(accent), accent)),
    };
  }

  return function useComfortStyles(comfortActive: boolean): T {
    const sheets = byAccent[useAccentName()];
    return comfortActive ? sheets.comfort : sheets.normal;
  };
}
