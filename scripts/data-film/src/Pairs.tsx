// C · "Some symptoms travel in pairs." Three links, drawn one at a time.
//
// Two pairs come from the detector's latest output (domain_connections); the
// weekday link is computed from the rows. No pair is shown that the sample
// data does not hold: findPair throws if one is missing.

import { useCurrentFrame } from 'remotion';
import { CARD, DIM, Foot, Head, INK, LABELS, Stage, WEEKDAY_NAMES, colorOf, data, display, findPair, isMind, ramp, rise } from './kit';

export const PAIRS_FRAMES = 330;

const LEFT_X = 250;
const RIGHT_X = 830;
const DROP = 60; // the right node sits a little lower
const LEN = Math.hypot(RIGHT_X - LEFT_X, DROP);
const ANGLE = (Math.atan2(DROP, RIGHT_X - LEFT_X) * 180) / Math.PI;
const NODE = 130;
const FIRST = 34;
const STEP = 62;
const CLOSE = FIRST + STEP * 3 + 10;

type End = { domain?: string; day?: string };

const Node = ({ x, y, p, end }: { x: number; y: number; p: number; end: End }) => {
  const color = end.domain ? colorOf(end.domain) : '#3a4152';
  const tag = end.domain ? (isMind(end.domain) ? 'MIND' : 'BODY') : 'DAY';
  const name = end.domain ? LABELS[end.domain] : end.day;
  return (
    <>
      <div style={{ position: 'absolute', left: x - NODE / 2, top: y - NODE / 2, width: NODE, height: NODE, boxSizing: 'border-box', borderRadius: end.domain ? NODE / 2 : 26, border: `6px solid ${color}`, backgroundColor: end.domain ? '#0a0c12' : CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: p, transform: `scale(${0.7 + p * 0.3})` }}>
        {end.domain ? <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color }} /> : <div style={{ fontFamily: display, fontWeight: 700, fontSize: 40, color: INK }}>{(end.day ?? '').slice(0, 3).toUpperCase()}</div>}
      </div>
      <div style={{ position: 'absolute', left: x - 200, width: 400, top: y + NODE / 2 + 14, textAlign: 'center', opacity: p }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.14em', color: DIM }}>{tag}</div>
        <div style={{ marginTop: 4, fontSize: 36, fontWeight: 600 }}>{name}</div>
      </div>
    </>
  );
};

export const Pairs = () => {
  const frame = useCurrentFrame();
  const f = data.finding;
  const together = findPair('concentration', 'energy');
  const opposite = findPair('brain_fog', 'concentration');
  const pairs: { left: End; right: End; label: string; dashed: boolean }[] = [
    { left: { domain: together.a }, right: { domain: together.b }, label: together.together ? 'move together' : 'move in opposite directions', dashed: !together.together },
    { left: { day: WEEKDAY_NAMES[f.peakWeekday] }, right: { domain: f.domain }, label: `+${f.gap.toFixed(1)} · ${f.weeksHeld} of ${f.weeksTotal} weeks`, dashed: false },
    { left: { domain: opposite.a }, right: { domain: opposite.b }, label: opposite.together ? 'move together' : 'one rises, the other falls', dashed: !opposite.together },
  ];
  return (
    <Stage>
      <Head frame={frame} bar={data.colors.energy} a="Some symptoms" b="travel in pairs." />

      {pairs.map((pair, i) => {
        const y = 650 + i * 300;
        const start = FIRST + i * STEP;
        const left = ramp(frame, start, 12);
        const line = ramp(frame, start + 8, 22);
        const right = ramp(frame, start + 24, 12);
        const label = ramp(frame, start + 32, 14);
        return (
          <div key={pair.label}>
            <div style={{ position: 'absolute', left: LEFT_X, top: y - 2, width: LEN * line, height: 0, borderTop: `5px ${pair.dashed ? 'dashed' : 'solid'} #2f3646`, transformOrigin: '0 50%', transform: `rotate(${ANGLE}deg)` }} />
            <Node x={LEFT_X} y={y} p={left} end={pair.left} />
            <Node x={RIGHT_X} y={y + DROP} p={right} end={pair.right} />
            <div style={{ position: 'absolute', left: (LEFT_X + RIGHT_X) / 2, top: y + DROP / 2, transform: `translate(-50%, -50%) scale(${0.9 + label * 0.1})`, padding: '12px 24px', borderRadius: 16, backgroundColor: CARD, border: '2px solid #232a38', fontSize: 28, fontWeight: 500, color: '#cdd3df', whiteSpace: 'nowrap', opacity: label }}>{pair.label}</div>
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: 64, right: 64, top: 1480, textAlign: 'center', ...rise(ramp(frame, CLOSE, 18)) }}>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em' }}>No labels. Just data.</span>
      </div>
      <Foot frame={frame} at={CLOSE + 14} />
    </Stage>
  );
};
