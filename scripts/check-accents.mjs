// Asserts every contrast and separation floor the accent system claims.
//
// Values are parsed out of src/constants/accents.ts and src/lib/domains.ts
// rather than restated here, so this cannot quietly agree with a stale copy
// of the palette. Exits non-zero on the first failure, so it is usable as a
// pre-build gate.
//
//   node scripts/check-accents.mjs

import { readFileSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);
const accentsSrc = readFileSync(new URL('constants/accents.ts', SRC), 'utf8');
const domainsSrc = readFileSync(new URL('lib/domains.ts', SRC), 'utf8');

const BG = '#0a0c12';
const BODY = '#e2e8f0';

// ── Parse ──────────────────────────────────────────────────────────────────

/** Every `name: { ... }` accent block, with its own nested `quiet: { ... }`. */
function parseAccents(src) {
  const body = src.slice(src.indexOf('export const ACCENTS'));
  const out = {};
  for (const m of body.matchAll(/^  (\w+): \{([\s\S]*?)^  \},$/gm)) {
    const [, name, block] = m;
    const tokens = {};
    for (const t of block.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) tokens[t[1]] = t[2];
    const quiet = {};
    const q = block.match(/quiet: \{([^}]*)\}/);
    if (q) for (const t of q[1].matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) quiet[t[1]] = t[2];
    // The quiet block's keys collide with the outer ones (fill, onFill, text),
    // so strip them back out of the top level.
    for (const k of Object.keys(quiet)) if (tokens[k] === quiet[k]) delete tokens[k];
    out[name] = { ...parseOuter(block), quiet };
  }
  return out;
}

/** The accent's own tokens, i.e. everything before the nested quiet block. */
function parseOuter(block) {
  const upTo = block.indexOf('quiet: {');
  const head = upTo === -1 ? block : block.slice(0, upTo);
  const tokens = {};
  for (const t of head.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) tokens[t[1]] = t[2];
  return tokens;
}

function parseDomains(src) {
  const out = {};
  const block = src.match(/DOMAIN_COLORS[^=]*=\s*\{([\s\S]*?)\n\}/);
  if (block) for (const m of block[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) out[m[1]] = m[2];
  const body = src.match(/BODY_COLOR\s*=\s*'(#[0-9A-Fa-f]{6})'/);
  if (body) out.body = body[1];
  return out;
}

// ── Colour maths ───────────────────────────────────────────────────────────

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function lab(hex) {
  let [r, g, b] = rgb(hex).map((v) => {
    v /= 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  });
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76. Under 15 is confusable at a glance; over 30 is plainly different. */
function deltaE(a, b) {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ── Checks ─────────────────────────────────────────────────────────────────

const ACCENTS = parseAccents(accentsSrc);
const DOMAINS = parseDomains(domainsSrc);

if (Object.keys(ACCENTS).length === 0) {
  console.error('Parsed no accents out of constants/accents.ts — the file shape changed.');
  process.exit(1);
}
if (Object.keys(DOMAINS).length === 0) {
  console.error('Parsed no domain colours out of lib/domains.ts — the file shape changed.');
  process.exit(1);
}

const failures = [];
const pass = (cond, label, detail) => {
  if (!cond) failures.push(`${label}: ${detail}`);
  return cond;
};

/** Roles rendered as text or icons on the page background. `textSoft` is only
 *  used at larger sizes, so it takes the AA large floor. */
const TEXT_ROLES = { text: 4.5, textSoft: 3, textFlat: 4.5 };
/** Roles used as a button fill, each with the token that labels it. */
const FILL_ROLES = [
  ['fill', 'onFill'],
  ['fillAlt', 'onFill'],
  ['signIn', 'onFill'],
];

function nearestDomain(hex) {
  return Object.entries(DOMAINS).reduce(
    (best, [name, c]) => {
      const d = deltaE(hex, c);
      return d < best.d ? { name, d } : best;
    },
    { name: '', d: Infinity },
  );
}

for (const [name, a] of Object.entries(ACCENTS)) {
  console.log(`\n${name}`);

  for (const [role, floor] of Object.entries(TEXT_ROLES)) {
    const c = a[role];
    const onBg = contrast(c, BG);
    const fromBody = deltaE(c, BODY);
    const near = nearestDomain(c);
    pass(onBg >= floor, `${name}.${role}`, `${onBg.toFixed(2)}:1 on the background, needs ${floor}:1`);
    pass(fromBody >= 15, `${name}.${role}`, `dE ${fromBody.toFixed(1)} from body text — reads as prose, not an accent`);
    pass(near.d >= 15, `${name}.${role}`, `dE ${near.d.toFixed(1)} from the ${near.name} domain colour`);
    console.log(
      `  ${role.padEnd(9)} ${c}  ${onBg.toFixed(1).padStart(5)}:1 on bg   dE ${fromBody.toFixed(0).padStart(2)} from body   ` +
        `nearest data: ${near.name} (${near.d.toFixed(0)})`,
    );
  }

  for (const [fillRole, labelRole] of FILL_ROLES) {
    const ratio = contrast(a[labelRole], a[fillRole]);
    pass(ratio >= 4.5, `${name}.${fillRole}`, `label ${a[labelRole]} on it is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    console.log(`  ${fillRole.padEnd(9)} ${a[fillRole]}  ${a[labelRole]} label at ${ratio.toFixed(1)}:1`);
  }

  const q = a.quiet;
  const qOnBg = contrast(q.text, BG);
  const qOnFill = contrast(q.onFill, q.fill);
  const qFromBody = deltaE(q.text, BODY);
  pass(qOnBg >= 4.5, `${name}.quiet.text`, `${qOnBg.toFixed(2)}:1 on the background`);
  pass(qOnFill >= 4.5, `${name}.quiet.fill`, `label is ${qOnFill.toFixed(2)}:1 on it`);
  pass(qFromBody >= 15, `${name}.quiet.text`, `dE ${qFromBody.toFixed(1)} from body text`);
  console.log(`  quiet     ${q.fill}  label ${qOnFill.toFixed(1)}:1   text ${q.text} ${qOnBg.toFixed(1)}:1 on bg`);

  // A border that does not separate from the page is not a border.
  for (const role of ['border']) {
    const ratio = contrast(a[role], BG);
    pass(ratio >= 1.15, `${name}.${role}`, `${ratio.toFixed(2)}:1 against the page — invisible`);
  }
}

// The three have to be plainly different from each other, or the setting does
// nothing visible.
console.log('\nseparation between accents');
const names = Object.keys(ACCENTS);
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const d = deltaE(ACCENTS[names[i]].fill, ACCENTS[names[j]].fill);
    pass(d >= 25, `${names[i]} vs ${names[j]}`, `fills are only dE ${d.toFixed(1)} apart`);
    console.log(`  ${names[i]} vs ${names[j]}: fill dE ${d.toFixed(0)}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('\nAll accent checks pass.');
