// A · "Is it me, or is it Wednesdays?" The question, then the weekday chart.

import { useCurrentFrame } from 'remotion';
import { CARD, DIM, Foot, Head, LINE, MARGIN, MUTED, Stage, WEEKDAY_NAMES, WEEK_LETTERS, WEEK_ORDER, WeekdaySentence, colorOf, data, display, ramp, rise, LABELS } from './kit';

export const WEDNESDAYS_FRAMES = 240;

const BARS = 44;
const PILL = BARS + 46;
const FINDING = PILL + 22;
const SCALE = 94; // px per point

export const Wednesdays = () => {
  const frame = useCurrentFrame();
  const f = data.finding;
  const color = colorOf(f.domain);
  const card = ramp(frame, 26, 18);
  return (
    <Stage>
      <Head frame={frame} bar={color} a="Is it me," b={`or is it ${WEEKDAY_NAMES[f.peakWeekday]}?`} />

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 580, height: 800, boxSizing: 'border-box', backgroundColor: '#11141b', border: `2px solid ${LINE}`, borderRadius: 40, padding: '40px 44px 0', ...rise(card, 24) }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>{LABELS[f.domain]} · average by day</div>
        <div style={{ position: 'absolute', left: 44, right: 44, bottom: 96, height: 620, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #232a38' }}>
          {WEEK_ORDER.map((w, i) => {
            const v = f.byWeekday[w] as number;
            const peak = w === f.peakWeekday;
            const up = ramp(frame, BARS + i * 4, 24);
            const pill = ramp(frame, PILL, 14);
            return (
              <div key={w} style={{ width: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
                {peak ? <div style={{ padding: '6px 16px', borderRadius: 14, backgroundColor: '#2a2213', border: '2px solid #5c4a1e', fontFamily: display, fontWeight: 700, fontSize: 42, color, ...rise(pill, 14) }}>+{f.gap.toFixed(1)}</div> : null}
                <div style={{ fontSize: 28, fontWeight: 600, color: peak ? color : DIM, opacity: up, fontVariantNumeric: 'tabular-nums' }}>{(v * up).toFixed(1)}</div>
                <div style={{ width: 104, height: v * SCALE * up, borderRadius: '18px 18px 6px 6px', backgroundColor: peak ? color : '#2a3040' }} />
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 44, right: 44, bottom: 36, display: 'flex', justifyContent: 'space-between' }}>
          {WEEK_ORDER.map((w) => (
            <div key={w} style={{ width: 104, textAlign: 'center', fontSize: 30, fontWeight: 600, color: w === f.peakWeekday ? color : DIM }}>
              {WEEK_LETTERS[w]}
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1420, fontSize: 40, lineHeight: 1.38, ...rise(ramp(frame, FINDING, 18)) }}>
        <WeekdaySentence f={f} />
      </div>
      <Foot frame={frame} at={FINDING + 12} />
    </Stage>
  );
};
