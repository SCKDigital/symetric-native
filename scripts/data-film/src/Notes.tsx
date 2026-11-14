// B · "You keep notes. They add up to this." Scribbled notes land one by one,
// then recede behind what the check-ins found.
//
// The notes are a dramatisation of how someone tracks without the app. The two
// findings under them are real: one computed from the rows, one taken from the
// detector's own output.

import { useCurrentFrame } from 'remotion';
import { CARD, DIM, Foot, Head, LINE, MARGIN, MUTED, PairSentence, Stage, WeekdaySentence, colorOf, data, findPair, hand, ramp, rise } from './kit';

export const NOTES_FRAMES = 300;

const NOTES = [
  { t: 'wiped out again??', when: 'Mon 9:12 pm', x: 60, y: 560, w: 440, r: -5 },
  { t: 'bad week? or just a bad wednesday', when: 'Wed 4:40 pm', x: 540, y: 540, w: 470, r: 4 },
  { t: "office too loud. couldn't think.", when: 'Wed 11:20 am', x: 100, y: 800, w: 450, r: 3 },
  { t: 'no energy, no focus. same thing?', when: 'Thu 2:05 pm', x: 570, y: 850, w: 440, r: -6 },
  { t: 'wednesday. again.', when: 'Wed 3:30 pm', x: 320, y: 1040, w: 400, r: -2 },
];
const FIRST_NOTE = 28;
const NOTE_GAP = 20;
const TURN = FIRST_NOTE + NOTES.length * NOTE_GAP + 26;
const CARD_IN = TURN + 12;

export const Notes = () => {
  const frame = useCurrentFrame();
  const f = data.finding;
  const pair = findPair('concentration', 'energy');
  const turn = ramp(frame, TURN, 26);
  return (
    <Stage>
      <Head frame={frame} bar={colorOf(f.domain)} a="You keep notes." b="They add up to this." />

      {NOTES.map((n, i) => {
        const p = ramp(frame, FIRST_NOTE + i * NOTE_GAP, 14);
        return (
          <div key={n.t} style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, boxSizing: 'border-box', padding: '28px 34px 24px', backgroundColor: CARD, border: `2px solid ${LINE}`, borderRadius: 24, boxShadow: '0 24px 50px rgba(0,0,0,0.45)', opacity: p * (1 - turn * 0.72), transform: `translateY(${(1 - p) * 40 - turn * 30}px) rotate(${n.r}deg) scale(${1 - turn * 0.06})` }}>
            <div style={{ fontFamily: hand, fontWeight: 600, fontSize: 56, lineHeight: 1.05, color: '#cdd3df' }}>{n.t}</div>
            <div style={{ marginTop: 14, fontSize: 22, color: DIM }}>{n.when}</div>
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1180, boxSizing: 'border-box', backgroundColor: CARD, border: `2px solid ${LINE}`, borderRadius: 36, padding: '40px 46px', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', ...rise(ramp(frame, CARD_IN, 20), 30) }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 20 }}>What stands out</div>
        <div style={{ fontSize: 38, lineHeight: 1.38, ...rise(ramp(frame, CARD_IN + 14, 16)) }}>
          <WeekdaySentence f={f} />
        </div>
        <div style={{ height: 2, backgroundColor: LINE, margin: '24px 0', opacity: ramp(frame, CARD_IN + 40, 12) }} />
        <div style={{ fontSize: 38, lineHeight: 1.38, ...rise(ramp(frame, CARD_IN + 44, 16)) }}>
          <PairSentence a={pair.a} b={pair.b} together={pair.together} />
        </div>
      </div>

      <Foot frame={frame} at={CARD_IN + 60} />
    </Stage>
  );
};
