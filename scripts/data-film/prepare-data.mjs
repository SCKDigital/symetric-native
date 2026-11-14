// Builds src/data.generated.json for the films.
//
// Two sources, and nothing is typed in by hand:
//   - colours: parsed out of src/lib/domains.ts, so a film can never drift
//     from the palette the app charts with (docs/brand.md, "The one rule")
//   - numbers: src/lib/demo/aisha-tables.json, the same sample dataset the
//     website demo and the sample report run on
//
// Every figure a film shows (the weekday gap, the week count) is computed
// here from those rows. If the sample data changes, the film changes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

// ── Colours ──────────────────────────────────────────────────────────────────
const domainsSrc = fs.readFileSync(path.join(root, 'src/lib/domains.ts'), 'utf8');
const block = domainsSrc.match(/export const DOMAIN_COLORS[^{]*\{([\s\S]*?)\};/);
if (!block) throw new Error('DOMAIN_COLORS not found in src/lib/domains.ts');
const colors = {};
for (const m of block[1].matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) colors[m[1]] = m[2];
const body = domainsSrc.match(/export const BODY_COLOR\s*=\s*'(#[0-9a-fA-F]{6})'/);
if (!body) throw new Error('BODY_COLOR not found in src/lib/domains.ts');
colors.body = body[1];

// ── The mark ─────────────────────────────────────────────────────────────────
// Read out of the component the app draws it with: regenerate, never redraw.
const logoSrc = fs.readFileSync(path.join(root, 'src/components/symetric-logo.tsx'), 'utf8');
const markPath = logoSrc.match(/const MARK_PATH =\s*['"`]([^'"`]+)['"`]/);
if (!markPath) throw new Error('MARK_PATH not found in src/components/symetric-logo.tsx');
const stops = [...logoSrc.matchAll(/<Stop offset="([\d.]+%)" stopColor="(#[0-9a-fA-F]{6})"/g)].map((m) => ({ offset: m[1], color: m[2] }));
if (stops.length < 2) throw new Error('gradient stops not found in src/components/symetric-logo.tsx');
const mark = { path: markPath[1], stops };

// ── Rows ─────────────────────────────────────────────────────────────────────
const { tables } = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/demo/aisha-tables.json'), 'utf8'));
const mind = tables.check_in_settings[0].active_domains;
const bodyDomains = tables.profiles[0].body_domains_active;
for (const d of mind) if (!colors[d]) throw new Error(`no colour for ${d}`);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
const dayMs = 86400000;
const utc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const completed = tables.check_ins.filter((c) => c.status === 'completed');
const dates = tables.check_ins.map((c) => c.scheduled_date).sort();
const first = utc(dates[0]);
const last = utc(dates[dates.length - 1]);

const allDays = [];
const days = allDays;
for (let t = first; t <= last; t += dayMs) {
  const date = iso(t);
  const rows = completed.filter((c) => c.scheduled_date === date);
  const scores = {};
  for (const d of mind) scores[d] = round1(mean(rows.map((r) => r[d]).filter((v) => typeof v === 'number')));
  const b = tables.body_checkins.find((r) => r.entry_date === date);
  const bodyScore = b ? round1(mean(bodyDomains.map((d) => b[d]).filter((v) => typeof v === 'number'))) : null;
  days.push({ date, weekday: new Date(t).getUTCDay(), checkIns: rows.length, scores, body: bodyScore });
}

// ── The weekday finding, for one domain ──────────────────────────────────────
// Described, not interpreted: the gap between one weekday's average and the
// average of every other day, and in how many weeks that weekday sat above
// the rest of its own week.
function weekdayFinding(domain, days = allDays) {
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((w) => round1(mean(days.filter((d) => d.weekday === w && d.scores[domain] !== null).map((d) => d.scores[domain]))));
  const peak = byDay.indexOf(Math.max(...byDay));
  const on = days.filter((d) => d.weekday === peak && d.scores[domain] !== null).map((d) => d.scores[domain]);
  const off = days.filter((d) => d.weekday !== peak && d.scores[domain] !== null).map((d) => d.scores[domain]);
  // Weeks run Monday to Sunday.
  const weeks = new Map();
  for (const d of days) {
    if (d.scores[domain] === null) continue;
    const t = utc(d.date);
    const monday = t - ((d.weekday + 6) % 7) * dayMs;
    if (!weeks.has(monday)) weeks.set(monday, { on: null, off: [] });
    const w = weeks.get(monday);
    if (d.weekday === peak) w.on = d.scores[domain];
    else w.off.push(d.scores[domain]);
  }
  let total = 0, held = 0;
  for (const w of weeks.values()) {
    if (w.on === null || !w.off.length) continue;
    total++;
    if (w.on > mean(w.off)) held++;
  }
  return { domain, byWeekday: byDay, peakWeekday: peak, gap: round1(mean(on) - mean(off)), weeksHeld: held, weeksTotal: total };
}

// ── The last 30 days, for the month film ─────────────────────────────────────
const month = days.slice(-30);
const monthFinding = weekdayFinding('sensory_sensitivity', month);

// ── Pairs the app itself detected, latest window only ────────────────────────
// Taken from the detector's own output rather than recomputed here, so a film
// never claims a link the app would not show.
const latest = tables.domain_connections.map((r) => r.window_end).sort().pop();
const connections = tables.domain_connections
  .filter((r) => r.window_end === latest)
  .map((r) => ({ a: r.domain_a, b: r.domain_b, together: r.moves_together, strength: r.strength, sampleSize: r.sample_size }));

// ── Morning against evening, for one body symptom ────────────────────────────
function morningEvening(domain) {
  let total = 0, held = 0;
  for (const b of tables.body_checkins) {
    const m = b[`morning_${domain}`], e = b[domain];
    if (typeof m !== 'number' || typeof e !== 'number') continue;
    total++;
    if (m > e) held++;
  }
  return { domain, held, total };
}

// ── What the report page needs ───────────────────────────────────────────────
const profile = tables.profiles[0];
const anxietyRun = tables.detected_clusters
  .filter((c) => c.cluster_type === 'sustained_deviation' && c.domains_involved.includes('anxiety') && c.direction === 'elevated')
  .sort((x, y) => (x.start_date < y.start_date ? 1 : -1))[0];
const report = {
  name: profile.report_display_name,
  from: days[0].date,
  to: days[days.length - 1].date,
  scheduled: tables.check_ins.length,
  completed: completed.length,
  anxietyRun: anxietyRun ? { from: anxietyRun.start_date, days: Math.round((utc(anxietyRun.end_date) - utc(anxietyRun.start_date)) / dayMs) + 1 } : null,
  questions: [...tables.prepare_questions].sort((x, y) => x.sort_order - y.sort_order).map((q) => q.question_text),
};

const out = {
  generatedFrom: 'src/lib/domains.ts + src/lib/demo/aisha-tables.json',
  colors,
  mark,
  mind,
  days,
  totals: { days: days.length, checkIns: completed.length, daysLogged: days.filter((d) => d.checkIns > 0).length },
  finding: weekdayFinding('sensory_sensitivity'),
  month: { days: month, missed: month.filter((d) => d.checkIns === 0).length, finding: monthFinding },
  connections,
  morningDizziness: morningEvening('orthostatic'),
  report,
};

fs.mkdirSync(path.join(here, 'src'), { recursive: true });
fs.writeFileSync(path.join(here, 'src/data.generated.json'), JSON.stringify(out, null, 1));
console.log(`data: ${out.totals.days} days, ${out.totals.checkIns} check-ins, ${out.totals.daysLogged} days logged`);
console.log('finding:', JSON.stringify(out.finding));
console.log('month:', out.month.missed, 'missed;', JSON.stringify(out.month.finding));
console.log('morning dizziness:', JSON.stringify(out.morningDizziness));
console.log('report:', JSON.stringify(out.report));
