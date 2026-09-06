import Svg, { Polyline } from 'react-native-svg';

// The two chevrons the web app draws inline as SVG: the disclosure arrow on a
// navigation row (AreaIndex.tsx) and the dropdown caret on a select. Same
// 24-unit viewBox and stroke weights as their web counterparts.

export function ChevronRightIcon({ size = 10, color = '#6b7a99' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 12, color = '#8892a4' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}
