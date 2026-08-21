/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Ported from the web app's src/index.css / src/utils/domainColors.ts — Symetric
// has no light theme today (body{} is hard-coded dark), so `light` here is a
// placeholder for Expo web/tooling, not a real supported mode. userInterfaceStyle
// is forced to "dark" in app.json for the same reason.
export const Colors = {
  light: {
    text: '#0a0c12',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    border: '#d8dce3',
    tint: '#BC812F',
  },
  dark: {
    text: '#e2e8f0',
    background: '#0a0c12',
    backgroundElement: '#10131c',
    backgroundSelected: '#1e2533',
    textSecondary: '#8892a4',
    border: '#1e2533',
    /** BODY_COLOR from src/utils/domainColors.ts — the body-domain accent, reused as the app tint. */
    tint: '#BC812F',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
