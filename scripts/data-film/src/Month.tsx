// D · "N days missed. Pattern still found." The last 30 days as a calendar:
// a day with no check-in is a blank, and the pattern shows anyway.
//
// The headline's count is computed, so it says whatever the sample data says.

import { useCurrentFrame } from 'remotion';
import { CARD, DIM, Foot, Head, LABELS, LINE, MARGIN, SOFT, Stage, WEEK_LETTERS, WEEK_ORDER, WeekdaySentence, colorOf, data, numberWord, ramp, rise, shortDate } from './kit';

export const MONTH_FRAMES = 280;

const TILE_W = 120;
const TILE_H = 118;
const GAP = 18;
const GRID_TOP = 620;
const FIRST = 30;
const PER_TILE = 2.4;
const LIGHT = FIRST + 30 * PER_TILE + 16; // the peak weekday lights up
const FINDING = LIGHT + 44;

export const Month = () => {
  const frame = useCurrentFrame();
  const { days, missed, finding: f } = data.month;
  const color = colorOf(f.domain);
  const offset = (days[0].weekday + 6) % 7; // Monday-first column of day one
  const rows = Math.ceil((offset + days.length) / 7);
  const gridBottom = GRID_TOP + rows * TILE_H + (rows - 1) * GAP;
  const a = `${numberWord(missed)} ${missed === 1 ? 'day' : 'days'} missed.`;
  return (
    <Stage>
      <Head frame={frame} bar={color} a={a} b="Pattern still found." />

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 540, display: 'flex', justifyContent: 'space-between', fontSize: 24, color: DIM, opacity: ramp(frame, 20, 14) }}>
        <span style={{ fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{LABELS[f.domain]}</span>
        <span>
          {shortDate(days[0].date)} to {shortDate(days[days.length - 1].date)}
        </span>
      </div>
      <div style={{ position: 'absolute', left: MARGIN, top: 582, width: 7 * TILE_W + 6 * GAP, display: 'flex', gap: GAP, opacity: ramp(frame, 22, 14) }}>
        {WEEK_ORDER.map((w) => {
          const lit = w === f.peakWeekday ? ramp(frame, LIGHT, 16) : 0;
          return (
            <div key={w} style={{ width: TILE_W, textAlign: 'center', fontSize: 24, fontWeight: 600, color: lit > 0.5 ? color : DIM }}>
              {WEEK_LETTERS[w]}
            </div>
          );
        })}
      </div>

      {days.map((d, i) => {
        const cell = offset + i;
        const col = cell % 7;
        const row = Math.floor(cell / 7);
        const p = ramp(frame, FIRST + i * PER_TILE, 12);
        const score = (d.scores as Record<string, number | null>)[f.domain];
        const peak = d.weekday === f.peakWeekday;
        const lit = peak ? ramp(frame, LIGHT + row * 5, 16) : 0;
        const fade = peak ? 1 : 1 - ramp(frame, LIGHT, 20) * 0.45;
        const empty = score === null;
        return (
          <div key={d.date} style={{ position: 'absolute', left: MARGIN + col * (TILE_W + GAP), top: GRID_TOP + row * (TILE_H + GAP), width: TILE_W, height: TILE_H, boxSizing: 'border-box', borderRadius: 20, backgroundColor: empty ? 'transparent' : CARD, border: empty ? '3px dashed #3a4152' : `2px solid ${LINE}`, overflow: 'hidden', opacity: p, transform: `scale(${0.8 + p * 0.2})` }}>
            <div style={{ position: 'absolute', left: 12, top: 9, fontSize: 21, fontWeight: 500, color: lit > 0.5 ? color : DIM }}>{+d.date.slice(8, 10)}</div>
            {empty ? null : (
              <>
                <div style={{ position: 'absolute', left: 12, right: 12, bottom: 11, height: (score as number) * 9 * p, borderRadius: 8, backgroundColor: '#3a4254', opacity: fade }} />
                <div style={{ position: 'absolute', left: 12, right: 12, bottom: 11, height: (score as number) * 9 * p, borderRadius: 8, backgroundColor: color, opacity: lit }} />
              </>
            )}
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: gridBottom + 26, display: 'flex', gap: 36, fontSize: 25, color: SOFT, opacity: ramp(frame, LIGHT + 10, 16) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: color }} />
          {['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][f.peakWeekday]}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 26, height: 26, boxSizing: 'border-box', borderRadius: 7, border: '3px dashed #3a4152' }} />
          No check-in. Nothing lost.
        </div>
      </div>

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: gridBottom + 96, fontSize: 38, lineHeight: 1.38, ...rise(ramp(frame, FINDING, 18)) }}>
        <WeekdaySentence f={f} />
      </div>
      <Foot frame={frame} at={FINDING + 12} note="Sample data · the last 30 days" />
    </Stage>
  );
};
