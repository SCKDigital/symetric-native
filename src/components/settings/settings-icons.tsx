import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

// Direct ports of the web app's settingsIcons.tsx — same 16-unit viewBox,
// same path data, same 1.6 stroke. Row icons are indigo, the destructive one
// is the danger red.

const STROKE = '#7b83f0';
const COMMON = { strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function Frame({ stroke = STROKE, children }: { stroke?: string; children: React.ReactNode }) {
  return <Svg width={16} height={16} viewBox="0 0 16 16" stroke={stroke} {...COMMON}>{children}</Svg>;
}

export function BrainIcon() {
  return (
    <Frame>
      <Path d="M6 3a2.2 2.2 0 0 0-2.2 2.2c0 .3.05.55.13.8A2 2 0 0 0 3 8c0 .7.35 1.3.9 1.7-.1.25-.15.5-.15.8A2 2 0 0 0 6 12.5" />
      <Path d="M10 3a2.2 2.2 0 0 1 2.2 2.2c0 .3-.05.55-.13.8A2 2 0 0 1 13 8c0 .7-.35 1.3-.9 1.7.1.25.15.5.15.8A2 2 0 0 1 10 12.5" />
      <Path d="M8 3v9.5" />
      <Path d="M6 5.5c.6.4 1.4.4 2 0M6 8c.6.4 1.4.4 2 0M6 10.3c.6.4 1.4.4 2 0" />
    </Frame>
  );
}

export function ClockIcon() {
  return <Frame><Circle cx={8} cy={8} r={6} /><Polyline points="8 5 8 8 10.5 9.5" /></Frame>;
}

export function ClockSimpleIcon() {
  return <Frame><Circle cx={8} cy={8} r={5.5} /><Polyline points="8 5 8 8 10.5 9.5" /></Frame>;
}

export function BellSlashIcon() {
  return (
    <Frame>
      <Path d="M8 2a4 4 0 0 1 4 4v3l1 1.5H3L4 9V6a4 4 0 0 1 4-4z" />
      <Path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
      <Line x1={2} y1={2} x2={14} y2={14} />
    </Frame>
  );
}

export function BellIcon() {
  return (
    <Frame>
      <Path d="M8 2a4 4 0 0 1 4 4v3l1 1.5H3L4 9V6a4 4 0 0 1 4-4z" />
      <Path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
    </Frame>
  );
}

export function DownloadIcon() {
  return <Frame><Path d="M8 2v8" /><Path d="M5 7l3 3 3-3" /><Path d="M3 12h10" /></Frame>;
}

export function CalendarIcon() {
  return (
    <Frame>
      <Rect x={2} y={3} width={12} height={11} rx={1.5} />
      <Line x1={2} y1={7} x2={14} y2={7} />
      <Line x1={5} y1={1} x2={5} y2={4} />
      <Line x1={11} y1={1} x2={11} y2={4} />
      <Line x1={6} y1={10.5} x2={10} y2={10.5} />
    </Frame>
  );
}

export function RefreshIcon() {
  return <Frame><Path d="M3 8a5 5 0 1 0 1.5-3.5L2 3" /><Polyline points="2 3 2 7 6 7" /></Frame>;
}

export function EyeIcon() {
  return <Frame><Path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><Circle cx={8} cy={8} r={2} /></Frame>;
}

export function PaletteIcon() {
  return <Frame><Circle cx={8} cy={8} r={5.5} /><Path d="M8 2.5v11M2.5 8h11" /></Frame>;
}

export function PaperPlaneIcon() {
  return <Frame><Path d="M14 2L2 7l4.5 1.5L8 14l2-4 4-8z" /><Line x1={6.5} y1={8.5} x2={14} y2={2} /></Frame>;
}

export function BodyIcon() {
  return <Frame><Circle cx={8} cy={3} r={1.8} /><Path d="M8 6.5v4M8 6.5l-3 1.5M8 6.5l3 1.5M8 10.5l-2.5 3M8 10.5l2.5 3" /></Frame>;
}

export function CycleIcon() {
  return <Frame><Path d="M8 2c2.5 3 4 5.5 4 7.5a4 4 0 1 1-8 0C4 7.5 5.5 5 8 2z" /></Frame>;
}

export function LockIcon() {
  return <Frame><Rect x={3} y={7} width={10} height={7} rx={1.5} /><Path d="M5 7V4.5a3 3 0 0 1 6 0V7" /></Frame>;
}

export function XDangerIcon() {
  return <Frame stroke="#b05050"><Line x1={4} y1={4} x2={12} y2={12} /><Line x1={12} y1={4} x2={4} y2={12} /></Frame>;
}
