import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Web variant, used only by an `expo export --platform web` build. Static
 * rendering has no colour scheme to read, so the first paint has to be
 * deterministic and the real value can only be picked up once hydrated.
 *
 * useSyncExternalStore rather than setState in an effect: "have we hydrated
 * yet" is exactly the question it exists to answer. This was the app's one
 * standing lint error, which mattered more than it looks — a permanent error
 * hides every new one behind the same "N problems" summary.
 */
const subscribe = () => () => {};
const getSnapshot = () => true; // client: hydrated
const getServerSnapshot = () => false; // static render: not yet

export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const colorScheme = useRNColorScheme();
  return hasHydrated ? colorScheme : 'light';
}
