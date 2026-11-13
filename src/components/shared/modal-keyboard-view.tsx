import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Keeps a Modal's text fields above the keyboard. Make it the Modal's first
 * child, so its frame starts at the top of the screen (KeyboardAvoidingView
 * measures against that).
 *
 * Needed inside every Modal, not just on screens: on iOS a Modal is its own
 * window, out of reach of anything outside it, and on Android the app draws
 * edge-to-edge, so the window no longer shrinks for the keyboard (see
 * auth-screen.tsx).
 *
 * - Sheets and centred cards (the default): padding on both platforms, which
 *   lifts a bottom sheet or re-centres a card in the space left.
 * - `fullScreen`, for a Modal that is one long ScrollView: padding on Android,
 *   where the shrinking ScrollView keeps the focused field in view by itself.
 *   On iOS nothing here; give the ScrollView `automaticallyAdjustKeyboardInsets`
 *   instead, which also scrolls the focused field into view (padding alone
 *   would leave it under the fold).
 */
export function ModalKeyboardView({ children, fullScreen = false, style }: {
  children: ReactNode;
  fullScreen?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const behavior = fullScreen && Platform.OS === 'ios' ? undefined : 'padding';
  return (
    <KeyboardAvoidingView behavior={behavior} style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Top padding for a full-screen Modal: the design's own value, or enough to
 * clear the status bar, whichever is more. A fixed 40 put the header under the
 * status bar on iPhones with a Dynamic Island (about 59pt).
 */
export function useModalTopPadding(designed: number): number {
  const { top } = useSafeAreaInsets();
  return Math.max(designed, top + 16);
}
