// Shared pieces for the films: type, colour, easing, the headline, the lockup.
// Brand rules live in docs/brand.md and docs/marketing-visuals.md.

import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { loadFont as loadDisplay } from '@remotion/google-fonts/DMSans';
import { loadFont as loadText } from '@remotion/google-fonts/Inter';
import { loadFont as loadHand } from '@remotion/google-fonts/Caveat';
import { loadFont as loadPrint } from '@remotion/google-fonts/Roboto';
import data from './data.generated.json';

export { data };

export const display = loadDisplay('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;
export const text = loadText('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;
export const hand = loadHand('normal', { weights: ['600'], subsets: ['latin'] }).fontFamily;
export const print = loadPrint('normal', { weights: ['400', '500', '700'], subsets: ['latin'] }).fontFamily;

export const W = 1080;
export const H = 1920;
export const MARGIN = 64;
export const BG = '#0a0c12';
export const INK = '#e2e8f0';
export const MUTED = '#8892a4';
export const SOFT = '#a9b2c3';
export const DIM = '#6b7a99';
export const CARD = '#141820';
export const LINE = '#1e2533';
export const PEN = '#27408B';

export const LABELS: Record<string, string> = {
  mood: 'Mood',
  energy: 'Energy',
  anxiety: 'Anxiety',
  concentration: 'Concentration',
  sensory_sensitivity: 'Sensory overwhelm',
  body: 'Body, all symptoms',
  brain_fog: 'Brain fog',
  fatigue: 'Fatigue',
  joint_instability: 'Joint instability',
  pain_mechanical: 'Joint & muscle pain',
  orthostatic: 'Dizziness',
};
export const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
export const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export const shortDate = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
export const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** A mind domain's own colour; every body symptom shares one. */
export const colorOf = (domain: string) => (data.colors as Record<string, string>)[domain] ?? data.colors.body;
export const isMind = (domain: string) => domain in data.colors && domain !== 'body';

// Ease out, never bounce.
const out = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const ramp = (frame: number, from: number, len: number) => interpolate(frame, [from, from + len], [0, 1], { ...clamp, easing: out });
export const rise = (p: number, px = 16): CSSProperties => ({ opacity: p, transform: `translateY(${(1 - p) * px}px)` });

export const Stage = ({ children }: { children: ReactNode }) => <AbsoluteFill style={{ backgroundColor: BG, fontFamily: text, color: INK }}>{children}</AbsoluteFill>;

/** The two-tone headline: a colour bar, a grey set-up line, a white payoff. */
export const Head = ({ frame, bar, a, b, top = 270, size = 84, bAt = 14 }: { frame: number; bar: string; a: string; b: string; top?: number; size?: number; bAt?: number }) => (
  <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top }}>
    <div style={{ width: 84, height: 9, borderRadius: 5, backgroundColor: bar, marginBottom: 30, opacity: ramp(frame, 0, 12) }} />
    <div style={{ fontFamily: display, fontWeight: 700, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>
      <div style={{ color: MUTED, ...rise(ramp(frame, 2, 14)) }}>{a}</div>
      <div style={{ color: INK, ...rise(ramp(frame, bAt, 16)) }}>{b}</div>
    </div>
  </div>
);

export const Mark = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="0" y1="220" x2="162.17" y2="0">
        {data.mark.stops.map((s) => (
          <stop key={s.offset} offset={s.offset} stopColor={s.color} />
        ))}
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="225.28" fill="#1E293B" />
    <g transform="translate(300.65,225.28) scale(2.60655)">
      <path d={data.mark.path} fill="url(#mark)" />
    </g>
  </svg>
);

/** The lockup, and the line that says this is sample data. */
export const Foot = ({ frame, at, note }: { frame: number; at: number; note?: string }) => (
  <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1606, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: ramp(frame, at, 16) }}>
      <Mark size={52} />
      <span style={{ fontWeight: 600, fontSize: 36, letterSpacing: '-0.02em' }}>symetric</span>
    </div>
    <span style={{ fontSize: 24, color: DIM, opacity: ramp(frame, 8, 12) }}>{note ?? `Sample data · ${data.totals.checkIns} check-ins`}</span>
  </div>
);

/** The weekday finding, in the app's own sentence shape. */
export const WeekdaySentence = ({ f }: { f: typeof data.finding }) => (
  <>
    <span style={{ color: colorOf(f.domain) }}>{LABELS[f.domain]}</span> runs {f.gap.toFixed(1)} points higher on {WEEKDAY_NAMES[f.peakWeekday]}, holding true in {f.weeksHeld} of {f.weeksTotal} weeks.
  </>
);

/** A pair the app's own detector found, in its sentence shape. */
export const PairSentence = ({ a, b, together }: { a: string; b: string; together: boolean }) => (
  <>
    Your <span style={{ color: colorOf(a) }}>{LABELS[a]}</span> and <span style={{ color: colorOf(b) }}>{LABELS[b]}</span> tend to move {together ? 'together' : 'in opposite directions'}.
  </>
);

export const findPair = (a: string, b: string) => {
  const c = data.connections.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!c) throw new Error(`the sample data has no detected connection between ${a} and ${b}`);
  return c;
};
