// E · The number, huge. It counts up to the computed gap, then the ninety
// days it came from slide in underneath with the peak weekday lit.

import { useCurrentFrame } from 'remotion';
import { DIM, Foot, INK, LABELS, MARGIN, MUTED, Stage, WEEKDAY_NAMES, colorOf, data, display, ramp, rise } from './kit';

export const NUMBER_FRAMES = 240;

const COUNT = 10;
const LINE1 = 58;
const LINE2 = 80;
const STRIPES = 104;
const STRIPE_W = 1080 - MARGIN * 2;

export const BigNumber = () => {
  const frame = useCurrentFrame();
  const f = data.finding;
  const color = colorOf(f.domain);
  const count = ramp(frame, COUNT, 44);
  const cellW = STRIPE_W / data.days.length;
  return (
    <Stage>
      <div style={{ position: 'absolute', left: MARGIN, top: 290, width: 84, height: 9, borderRadius: 5, backgroundColor: color, opacity: ramp(frame, 0, 12) }} />
      <div style={{ position: 'absolute', left: MARGIN - 14, top: 330, fontFamily: display, fontWeight: 700, fontSize: 430, lineHeight: 0.9, letterSpacing: '-0.07em', color: INK, fontVariantNumeric: 'tabular-nums', ...rise(ramp(frame, 4, 16), 30) }}>+{(f.gap * count).toFixed(1)}</div>

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 770, fontFamily: display, fontWeight: 700, fontSize: 68, lineHeight: 1.08, letterSpacing: '-0.035em', ...rise(ramp(frame, LINE1, 18)) }}>
        points of <span style={{ color }}>{LABELS[f.domain].toLowerCase()}</span>, every {WEEKDAY_NAMES[f.peakWeekday].slice(0, -1)}.
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 950, fontSize: 36, lineHeight: 1.45, color: MUTED, ...rise(ramp(frame, LINE2, 18)) }}>
        Holding true in {f.weeksHeld} of {f.weeksTotal} weeks. The kind of detail that's gone by the time the appointment comes round.
      </div>

      {/* The ninety days the number came from */}
      <div style={{ position: 'absolute', left: MARGIN, top: 1250, width: STRIPE_W, opacity: ramp(frame, STRIPES, 14) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: DIM, marginBottom: 14 }}>
          <span>{LABELS[f.domain]}, every day</span>
          <span>{data.totals.days} days</span>
        </div>
        <div style={{ position: 'relative', height: 170 }}>
          {data.days.map((d, i) => {
            const score = (d.scores as Record<string, number | null>)[f.domain];
            const grow = ramp(frame, STRIPES + i * 0.7, 10);
            const peak = d.weekday === f.peakWeekday;
            const settle = ramp(frame, STRIPES + 76, 20);
            const base = score === null ? 1 : 0.14 + (Math.min(10, score) / 10) * 0.86;
            return (
              <div
                key={d.date}
                style={{ position: 'absolute', left: i * cellW, width: cellW + 0.5, bottom: 0, height: 170, backgroundColor: score === null ? '#141820' : color, opacity: base * (peak ? 1 : 1 - settle * 0.7), transform: `scaleY(${grow * (peak ? 1 : 1 - settle * 0.25)})`, transformOrigin: '50% 100%' }}
              />
            );
          })}
        </div>
      </div>

      <Foot frame={frame} at={STRIPES + 80} />
    </Stage>
  );
};
