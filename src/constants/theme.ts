import '@/global.css';

// Ported from the web app's src/index.css / src/utils/domainColors.ts. Symetric
// has no light theme: userInterfaceStyle is pinned to "dark" in app.json, and
// the tab bar reads these directly rather than following the system scheme.
export const Colors = {
  dark: {
    text: '#e2e8f0',
    background: '#0a0c12',
    backgroundElement: '#10131c',
    backgroundSelected: '#1e2533',
    textSecondary: '#8892a4',
    border: '#1e2533',
    /** BODY_COLOR from src/utils/domainColors.ts — the body-domain accent.
     *  Not the tab bar's colour: that follows the web app's <nav>, which is
     *  indigo (see NAV_ACTIVE in components/app-tabs.tsx). Using the body
     *  accent there tinted the whole shell amber and read as a body-tracking
     *  app rather than the web app's indigo chrome. */
    tint: '#BC812F',
  },
} as const;
