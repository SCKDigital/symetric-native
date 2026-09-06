import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

// The five tab-bar glyphs, traced from the web app's NAV_ICON_PATHS in
// App.tsx — same path data, same 24-unit viewBox, same 22px render size and
// 1.8 stroke. The tab bar previously used Ionicons stand-ins (today-outline /
// calendar-outline / analytics-outline / document-text-outline), which put a
// different icon under four of the five labels than the web app does. Anyone
// moving between the two was reading a different bottom bar.

interface NavIconProps {
  /** ColorValue, not string: expo-router hands tabBarIcon the resolved tint. */
  color: ColorValue;
  size?: number;
}

function Frame({ color, size = 22, children }: NavIconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function TodayIcon(props: NavIconProps) {
  return (
    <Frame {...props}>
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <Path d="M9 21V12h6v9" />
    </Frame>
  );
}

export function HistoryIcon(props: NavIconProps) {
  return (
    <Frame {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Polyline points="12 7 12 12 15 15" />
    </Frame>
  );
}

export function InsightsIcon(props: NavIconProps) {
  return (
    <Frame {...props}>
      <Path d="M18 20V10" />
      <Path d="M12 20V4" />
      <Path d="M6 20v-6" />
    </Frame>
  );
}

export function PrepareIcon(props: NavIconProps) {
  return (
    <Frame {...props}>
      <Path d="M9 11l3 3L22 4" />
      <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Frame>
  );
}

export function SettingsIcon(props: NavIconProps) {
  return (
    <Frame {...props}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Frame>
  );
}
