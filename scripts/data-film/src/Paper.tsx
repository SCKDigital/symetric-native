// F · "Don't describe it. Hand it over." A report page slides in, and a pen
// marks it: an underline, a loop round a question, two words in the margin.
//
// The page is laid out like the PDF's executive summary, and every line on it
// is computed from the sample rows or read from the sample tables (the
// questions are the ones saved on the sample appointment). The pen layer is a
// person marking the page, never the app concluding anything.

import { useCurrentFrame } from 'remotion';
import { Foot, Head, LABELS, PEN, Stage, WEEKDAY_NAMES, data, hand, print, ramp, shortDate } from './kit';

export const PAPER_FRAMES = 300;

const INK = '#1F2937';
const GREY = '#6B7280';
const RULE = '#D1D0C8';
const PAGE_IN = 26;
const UNDERLINE = 96;
const LOOP = 132;
const WORDS = 170;

const Tag = () => <span style={{ padding: '3px 12px', border: '1.5px solid #0F6E56', borderRadius: 6, fontSize: 17, fontWeight: 500, color: '#0F6E56', flexShrink: 0 }}>Firm</span>;

const Row = ({ main, sub, children }: { main: React.ReactNode; sub: string; children?: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '17px 0', borderBottom: `1px solid ${RULE}`, position: 'relative' }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 25, lineHeight: 1.38 }}>{main}</div>
      <div style={{ marginTop: 3, fontSize: 18, color: GREY }}>{sub}</div>
    </div>
    <Tag />
    {children}
  </div>
);

export const Paper = () => {
  const frame = useCurrentFrame();
  const r = data.report;
  const f = data.finding;
  const dz = data.morningDizziness;
  const page = ramp(frame, PAGE_IN, 30);
  const underline = ramp(frame, UNDERLINE, 20);
  const loop = ramp(frame, LOOP, 30);
  const words = ramp(frame, WORDS, 20);
  const pct = Math.round((r.completed / r.scheduled) * 100);
  return (
    <Stage>
      <Head frame={frame} bar={data.colors.anxiety} a="Don't describe it." b="Hand it over." />

      <div style={{ position: 'absolute', left: 84, top: 540, width: 912, height: 940, boxSizing: 'border-box', backgroundColor: '#FBFAF6', borderRadius: 5, padding: '44px 52px 0', fontFamily: print, color: INK, boxShadow: '0 50px 120px rgba(0,0,0,0.75), 0 6px 20px rgba(0,0,0,0.5)', opacity: Math.min(1, page * 2), transform: `translateY(${(1 - page) * 520}px) rotate(${-3 - (1 - page) * 5}deg)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 12, borderBottom: `2px solid ${RULE}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.12em' }}>
            SYMETRIC <span style={{ fontWeight: 400, letterSpacing: 0, color: GREY }}>· Executive Summary</span>
          </div>
          <div style={{ fontSize: 18, color: GREY }}>Sample report</div>
        </div>
        <div style={{ marginTop: 24, fontSize: 52, fontWeight: 700 }}>{r.name}</div>
        <div style={{ marginTop: 4, fontSize: 19, color: GREY }}>
          {shortDate(r.from)} to {shortDate(r.to)} 2026 · {r.completed} of {r.scheduled} check-ins completed ({pct}%)
        </div>

        <div style={{ margin: '30px 0 2px', fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', color: GREY }}>PATTERNS DETECTED THIS PERIOD</div>
        {r.anxietyRun ? <Row main="Anxiety - sustained above baseline" sub={`(${r.anxietyRun.days} days · from ${shortDate(r.anxietyRun.from)})`} /> : null}
        <Row
          main={
            <>
              Your {LABELS[dz.domain]} tends to be worse first thing than by evening,{' '}
              <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                holding true on {dz.held} of {dz.total} days.
                <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ position: 'absolute', left: -4, bottom: -9, width: 'calc(100% + 8px)', height: 12, overflow: 'visible' }}>
                  <path d="M1,6 C20,2 38,8 58,4 C74,1 88,7 99,3" fill="none" stroke={PEN} strokeWidth={3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - underline} />
                </svg>
              </span>
            </>
          }
          sub={`(${dz.held} of ${dz.total} days with both a morning and an evening reading)`}
        />
        <Row main={`${LABELS[f.domain]} - ${WEEKDAY_NAMES[f.peakWeekday]} consistently higher`} sub={`(${f.gap.toFixed(1)} pt difference · ${f.weeksTotal} weeks · ${f.weeksHeld} consistent)`} />

        <div style={{ margin: '30px 0 16px', fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', color: GREY }}>PATIENT WANTS TO DISCUSS</div>
        {r.questions.slice(0, 2).map((q, i) => (
          <div key={q} style={{ position: 'relative', display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 26, marginRight: i === 1 ? 130 : 0 }}>
            <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 17, backgroundColor: INK, color: '#FBFAF6', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            <div style={{ fontSize: 25, lineHeight: 1.38 }}>{q}</div>
            {i === 1 ? (
              <>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', left: -26, top: -20, width: 'calc(100% + 52px)', height: 'calc(100% + 40px)', overflow: 'visible' }}>
                  <path d="M10,58 C5,22 38,5 70,7 C97,9 99,44 95,63 C90,92 52,97 26,93 C5,89 2,60 13,40" fill="none" stroke={PEN} strokeWidth={3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - loop} />
                </svg>
                <div style={{ position: 'absolute', right: -150, top: -64, fontFamily: hand, fontWeight: 600, fontSize: 48, lineHeight: 1, color: PEN, transform: 'rotate(-7deg)', whiteSpace: 'nowrap', clipPath: `inset(0 ${(1 - words) * 100}% 0 0)` }}>start here</div>
              </>
            ) : null}
          </div>
        ))}

        <div style={{ position: 'absolute', left: 52, right: 52, bottom: 30, paddingTop: 12, borderTop: `1px solid ${RULE}`, fontSize: 16, color: GREY, display: 'flex', justifyContent: 'space-between' }}>
          <span>Sample data</span>
          <span>Self-report data · on-device processing · correlation is not causation</span>
        </div>
      </div>

      <Foot frame={frame} at={WORDS + 24} />
    </Stage>
  );
};
