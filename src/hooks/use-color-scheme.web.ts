/**
 * Web variant, used only by an `expo export --platform web` build (the website
 * demo). Always dark. On iOS and Android, userInterfaceStyle: "dark" in
 * app.json pins the scheme, but nothing pins it in a browser, where
 * react-native's hook reports the visitor's OS preference — so a visitor in
 * light mode got the placeholder light palette (a white tab bar) on an app
 * that has no light theme. See the note on Colors in constants/theme.ts.
 *
 * A constant also settles the static-render question the previous version
 * answered with useSyncExternalStore: the first paint and the hydrated one
 * now agree by construction.
 */
export function useColorScheme() {
  return 'dark' as const;
}
