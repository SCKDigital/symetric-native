// "Ninety days": every check-in in the sample dataset arrives as a stripe,
// then the film closes in on the one weekday that keeps standing out.
//
// Brand rules this file has to keep (docs/brand.md):
//   - colour names a measurement: every hue comes from data.generated.json,
//     which prepare-data.mjs parses out of src/lib/domains.ts
//   - every number on screen is computed from the sample rows, with its count
//   - motion eases out and never bounces
//   - the frame says "Sample data" for as long as data is on it

import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { loadFont as loadDisplay } from '@remotion/google-fonts/DMSans';
import { loadFont as loadText } from '@remotion/google-fonts/Inter';
import data from './data.generated.json';

const display = loadDisplay('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;
const text = loadText('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;

const BG = '#0a0c12';
const INK = '#e2e8f0';
const MUTED = '#8892a4';
const GAP_CELL = '#141820';

const LABELS: Record<string, string> = {
  mood: 'Mood',
  energy: 'Energy',
  anxiety: 'Anxiety',
  concentration: 'Concentration',
  sensory_sensitivity: 'Sensory overwhelm',
  body: 'Body, all symptoms',
};
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

// ── Timeline, in frames at 30fps ─────────────────────────────────────────────
const FILL_START = 12;
const PER_DAY = 1.5;
const FILL_END = FILL_START + data.days.length * PER_DAY; // 147
const TURN = FILL_END + 24; // the film turns to the one row
const TURN_LEN = 30;
const BARS = TURN + TURN_LEN; // bars start rising
const GAP_IN = BARS + 44; // the "+1.8" lands
const FINDING_IN = GAP_IN + 16;
export const NINETY_DAYS_FRAMES = FINDING_IN + 80;

// ── Layout, 1080 x 1920 with 250px kept clear top and bottom ─────────────────
const MARGIN = 64;
const STRIPE_W = 1080 - MARGIN * 2;
const ROWS_TOP = 610;
const ROW_H = 152; // label + stripe + gap
const STRIPE_H = 96;
const BAR_BASE = 1330;
const BAR_SCALE = 78; // px per point

const out = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ramp = (frame: number, from: number, len: number) => interpolate(frame, [from, from + len], [0, 1], { ...clamp, easing: out });

const rows = [...data.mind, 'body'];
const scoreOf = (dayIndex: number, row: string): number | null => {
  const d = data.days[dayIndex];
  return row === 'body' ? d.body : (d.scores as Record<string, number | null>)[row];
};
const colorOf = (row: string) => (data.colors as Record<string, string>)[row];

const shortDate = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;

const Mark = ({ size }: { size: number }) => (
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

export const NinetyDays = () => {
  const frame = useCurrentFrame();
  const f = data.finding;
  const focus = f.domain;
  const focusIndex = rows.indexOf(focus);
  const focusColor = colorOf(focus);

  const turn = ramp(frame, TURN, TURN_LEN); // 0 = all rows, 1 = the one row
  const daysShown = Math.min(data.days.length, Math.max(0, Math.floor((frame - FILL_START) / PER_DAY) + 1));
  const lastDay = data.days[Math.max(0, daysShown - 1)];
  const checkInsSoFar = data.days.slice(0, daysShown).reduce((n, d) => n + d.checkIns, 0);

  const headA = ramp(frame, 0, 14) * (1 - turn);
  const headA2 = ramp(frame, 52, 16) * (1 - turn);
  const headB = ramp(frame, TURN + 10, 20);

  const cellW = STRIPE_W / data.days.length;

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: text, color: INK }}>
      {/* Headline, first half */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 280, fontFamily: display, fontWeight: 700, fontSize: 78, lineHeight: 1.04, letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>
        <div style={{ color: MUTED, opacity: headA, transform: `translateY(${(1 - ramp(frame, 0, 14)) * 16}px)` }}>Ninety days.</div>
        <div style={{ color: INK, opacity: headA2, transform: `translateY(${(1 - ramp(frame, 52, 16)) * 16}px)` }}>Every stripe is a check-in.</div>
      </div>

      {/* Headline, second half */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 280, fontFamily: display, fontWeight: 700, fontSize: 78, lineHeight: 1.04, letterSpacing: '-0.04em', whiteSpace: 'nowrap', opacity: headB, transform: `translateY(${(1 - headB) * 16}px)` }}>
        <div style={{ color: MUTED }}>Is it me,</div>
        <div style={{ color: INK }}>or is it {WEEKDAY_NAMES[f.peakWeekday]}?</div>
      </div>

      {/* Running count while the stripes arrive */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 520, display: 'flex', justifyContent: 'space-between', fontSize: 30, color: MUTED, fontVariantNumeric: 'tabular-nums', opacity: ramp(frame, FILL_START, 10) * (1 - turn) }}>
        <span>
          Day {daysShown} · {shortDate(lastDay.date)}
        </span>
        <span>{checkInsSoFar} check-ins</span>
      </div>

      {/* The stripes */}
      {rows.map((row, r) => {
        const isFocus = row === focus;
        const rowOpacity = isFocus ? 1 : 1 - turn;
        const lift = isFocus ? -turn * (focusIndex * ROW_H + 30) : 0;
        return (
          <div key={row} style={{ position: 'absolute', left: MARGIN, top: ROWS_TOP + r * ROW_H, width: STRIPE_W, opacity: rowOpacity, transform: `translateY(${lift}px)` }}>
            <div style={{ fontSize: 26, fontWeight: 500, color: '#a9b2c3', height: 38, opacity: ramp(frame, FILL_START + r * 3, 12), transform: `translateY(${isFocus ? -turn * 26 : 0}px)` }}>{LABELS[row]}</div>
            <div style={{ position: 'relative', height: STRIPE_H }}>
              {data.days.map((d, i) => {
                const score = scoreOf(i, row);
                const grow = ramp(frame, FILL_START + i * PER_DAY, 9);
                const isPeakDay = d.weekday === f.peakWeekday;
                // After the turn, the focus row keeps only its peak weekday at full strength.
                const dim = isFocus && !isPeakDay ? 1 - turn * 0.72 : 1;
                const stretch = isFocus && isPeakDay ? 1 + turn * 0.3 : 1;
                const base = score === null ? 1 : 0.12 + (Math.min(10, score) / 10) * 0.88;
                return (
                  <div
                    key={d.date}
                    style={{
                      position: 'absolute',
                      left: i * cellW,
                      width: cellW + 0.5,
                      top: 0,
                      height: STRIPE_H,
                      backgroundColor: score === null ? GAP_CELL : colorOf(row),
                      opacity: base * dim,
                      transform: `scaleY(${grow * stretch})`,
                      transformOrigin: '50% 100%',
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Average by weekday, rising out of the row above */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: BAR_BASE - 560, height: 560, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #232a38', opacity: turn }}>
        {WEEK_ORDER.map((w, i) => {
          const v = f.byWeekday[w] as number;
          const peak = w === f.peakWeekday;
          const rise = ramp(frame, BARS + i * 4, 22);
          const pill = ramp(frame, GAP_IN, 14);
          return (
            <div key={w} style={{ width: 112, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
              {peak ? (
                <div style={{ padding: '8px 18px', borderRadius: 14, backgroundColor: '#2a2213', border: '2px solid #5c4a1e', fontFamily: display, fontWeight: 700, fontSize: 44, color: focusColor, opacity: pill, transform: `translateY(${(1 - pill) * 14}px)` }}>+{f.gap.toFixed(1)}</div>
              ) : null}
              <div style={{ fontSize: 30, fontWeight: 600, color: peak ? focusColor : '#6b7a99', opacity: rise, fontVariantNumeric: 'tabular-nums' }}>{(v * rise).toFixed(1)}</div>
              <div style={{ width: 112, height: v * BAR_SCALE * rise, borderRadius: '20px 20px 6px 6px', backgroundColor: peak ? focusColor : '#2a3040' }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: BAR_BASE + 18, display: 'flex', justifyContent: 'space-between', opacity: turn }}>
        {WEEK_ORDER.map((w) => (
          <div key={w} style={{ width: 112, textAlign: 'center', fontSize: 32, fontWeight: 600, color: w === f.peakWeekday ? focusColor : '#6b7a99' }}>
            {WEEK_LETTERS[w]}
          </div>
        ))}
      </div>

      {/* The finding, in the app's own sentence shape */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1430, fontSize: 40, lineHeight: 1.38, opacity: ramp(frame, FINDING_IN, 18), transform: `translateY(${(1 - ramp(frame, FINDING_IN, 18)) * 14}px)` }}>
        <span style={{ color: focusColor }}>{LABELS[focus]}</span> runs {f.gap.toFixed(1)} points higher on {WEEKDAY_NAMES[f.peakWeekday]}, holding true in {f.weeksHeld} of {f.weeksTotal} weeks.
      </div>

      {/* Lockup and the sample-data line */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1606, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: ramp(frame, FINDING_IN + 10, 16) }}>
          <Mark size={52} />
          <span style={{ fontWeight: 600, fontSize: 36, letterSpacing: '-0.02em' }}>symetric</span>
        </div>
        <span style={{ fontSize: 24, color: '#6b7a99', opacity: ramp(frame, FILL_START, 10) }}>Sample data · {data.totals.checkIns} check-ins</span>
      </div>
    </AbsoluteFill>
  );
};
