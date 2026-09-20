// Builds docs/symetric-brand-guide.pdf.
//
// Every colour, the mark geometry, the gradient and the version are read out
// of the source files rather than retyped, so the guide cannot quietly drift
// from the app. Regenerate it after any change to brand.ts, domains.ts,
// comfort-theme.ts or report/theme.ts:
//
//   node scripts/make-brand-guide.mjs
//
// Rendered by Chrome's own print engine, the same way the patient report is.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const read = p => readFileSync(join(ROOT, p), 'utf8');
const brandSrc = read('src/constants/brand.ts');
const domainSrc = read('src/lib/domains.ts');
const comfortSrc = read('src/lib/comfort-theme.ts');
const reportSrc = read('src/lib/report/theme.ts');
const logoSrc = read('src/components/symetric-logo.tsx');
const version = JSON.parse(read('app.json')).expo.version;

// ── Values, pulled from source ─────────────────────────────────────────────
const BRAND = Object.fromEntries(
  [...brandSrc.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map(m => [m[1], m[2]]));
const DOMAINS = Object.fromEntries(
  [...domainSrc.matchAll(/^  (\w+): '(#[0-9A-Fa-f]{6})',/gm)].map(m => [m[1], m[2]]));
const BODY_COLOR = domainSrc.match(/BODY_COLOR = '(#[0-9A-Fa-f]{6})'/)[1];
const UNKNOWN = domainSrc.match(/UNKNOWN_FACTOR_COLOR = '(#[0-9A-Fa-f]{6})'/)[1];
const COMFORT = {
  fill: comfortSrc.match(/QUIET_ACCENT = '(#[0-9A-Fa-f]{6})'/)[1],
  text: comfortSrc.match(/QUIET_ACCENT_TEXT = '(#[0-9A-Fa-f]{6})'/)[1],
  border: comfortSrc.match(/QUIET_ACCENT_BORDER = '(#[0-9A-Fa-f]{6})'/)[1],
};
const REPORT = Object.fromEntries(
  [...reportSrc.matchAll(/^    (\w+): '(#[0-9A-Fa-f]{6})',/gm)].map(m => [m[1], m[2]]));
const MARK_PATH = logoSrc.match(/const MARK_PATH =\s*'([^']+)'/)[1];
const MARK_TRANSFORM = logoSrc.match(/transform="(translate\([^"]+\))"/)[1];
const STOPS = [...logoSrc.matchAll(/offset="(\d+)%" stopColor="(#[0-9A-Fa-f]{6})"/g)];
const GRAD = logoSrc.match(/<LinearGradient[^>]*x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/);

const APP_BG = '#0a0c12';

// ── Colour maths, for the figures printed beside each swatch ───────────────
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function lab(c) {
  let [r, g, b] = rgb(c).map(v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => { const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b); return Math.hypot(l1 - l2, a1 - a2, b1 - b2); };
const nearestDomain = c => Object.entries({ ...DOMAINS, body: BODY_COLOR })
  .reduce((best, [n, v]) => { const d = deltaE(c, v); return d < best.d ? { n, d } : best; }, { n: '', d: 999 });

// ── Pieces ─────────────────────────────────────────────────────────────────
const markSvg = (size, scale, tile, radius) => `
  <svg width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs><linearGradient id="mg${size}" gradientUnits="userSpaceOnUse" x1="${GRAD[1]}" y1="${GRAD[2]}" x2="${GRAD[3]}" y2="${GRAD[4]}">
      ${STOPS.map(s => `<stop offset="${s[1]}%" stop-color="${s[2]}"/>`).join('')}
    </linearGradient></defs>
    ${tile ? `<rect width="1024" height="1024" rx="${radius}" fill="${tile}"/>` : ''}
    <g transform="translate(${(1024 - 1024 * scale) / 2},${(1024 - 1024 * scale) / 2}) scale(${scale})">
      <g transform="${MARK_TRANSFORM}"><path d="${MARK_PATH}" fill="url(#mg${size})"/></g>
    </g>
  </svg>`;

/** A swatch, with the numbers that decide whether it may be used. */
function swatch(name, hex, note, opts = {}) {
  const onDark = contrast(hex, APP_BG);
  const whiteOn = contrast('#ffffff', hex);
  const near = opts.compare === false ? null : nearestDomain(hex);
  return `<div class="sw">
    <div class="chip" style="background:${hex}"></div>
    <div class="swbody">
      <div class="swname">${name}</div>
      <div class="swhex">${hex.toUpperCase()}</div>
      <div class="swnote">${note}</div>
      <div class="swnum">
        <span>on #0a0c12 <b>${onDark.toFixed(1)}:1</b></span>
        <span>white on it <b>${whiteOn.toFixed(1)}:1</b></span>
        ${near ? `<span>nearest data <b>ΔE ${near.d.toFixed(0)}</b></span>` : ''}
      </div>
    </div>
  </div>`;
}

/** The washes this colour is actually used at, via brandTint(). */
function tintRow(hex, alphas = [1, 0.25, 0.15, 0.1, 0.06]) {
  return `<div class="tints">${alphas.map(a => `
    <div class="tint">
      <div class="tintchip" style="background:${APP_BG}">
        <div style="background:${hex};opacity:${a};width:100%;height:100%"></div>
      </div>
      <span>${a === 1 ? 'solid' : a}</span>
    </div>`).join('')}</div>`;
}

const dataSwatch = (name, hex) => `<div class="dsw">
  <div class="dchip" style="background:${hex}"></div>
  <div><div class="dname">${name}</div><div class="dhex">${hex.toUpperCase()}</div></div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#1F2937; font-size:9.5pt; line-height:1.5; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size:30pt; margin:0 0 4pt; letter-spacing:-0.8pt; }
  h2 { font-size:13pt; margin:0 0 3pt; letter-spacing:-0.2pt; }
  h3 { font-size:9pt; text-transform:uppercase; letter-spacing:1.1pt; color:#6B7280;
       margin:16pt 0 7pt; padding-bottom:3pt; border-bottom:0.5pt solid #D1D0C8; }
  h3:first-of-type { margin-top:0; }
  p { margin:0 0 7pt; }
  .lede { font-size:11pt; color:#374151; }
  .muted { color:#6B7280; }
  .small { font-size:8pt; }
  .cover { height:247mm; display:flex; flex-direction:column; justify-content:space-between; }
  .covermark { display:flex; align-items:center; gap:14pt; }
  .coverword { font-size:34pt; font-weight:600; letter-spacing:-1pt; }
  .rule { background:#0F6E56; color:#fff; padding:12pt 14pt; border-radius:4pt; margin:10pt 0 14pt; }
  .rule b { font-size:11pt; }
  .rule p { margin:6pt 0 0; color:#D7EDE6; }
  .sw { display:flex; gap:10pt; align-items:flex-start; margin-bottom:8pt; break-inside:avoid; }
  .chip { width:52pt; height:52pt; border-radius:5pt; flex-shrink:0; border:0.5pt solid rgba(0,0,0,0.12); }
  .swbody { flex:1; }
  .swname { font-weight:600; font-size:10pt; }
  .swhex { font-family:Consolas,monospace; font-size:8.5pt; color:#6B7280; }
  .swnote { margin:2pt 0 3pt; }
  .swnum { display:flex; gap:12pt; font-size:7.5pt; color:#6B7280; }
  .swnum b { color:#1F2937; }
  .tints { display:flex; gap:6pt; margin:0 0 12pt 62pt; }
  .tint { text-align:center; font-size:7pt; color:#6B7280; }
  .tintchip { width:46pt; height:22pt; border-radius:3pt; overflow:hidden; border:0.5pt solid #D1D0C8; margin-bottom:2pt; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:4pt 18pt; }
  .dsw { display:flex; align-items:center; gap:8pt; padding:3pt 0; break-inside:avoid; }
  .dchip { width:26pt; height:26pt; border-radius:4pt; flex-shrink:0; border:0.5pt solid rgba(0,0,0,0.12); }
  .dname { font-weight:600; }
  .dhex { font-family:Consolas,monospace; font-size:8pt; color:#6B7280; }
  .situ { background:${APP_BG}; border-radius:8pt; padding:14pt; color:#e2e8f0; }
  .situ .k { font-size:7.5pt; letter-spacing:1pt; color:#7886a0; margin-bottom:5pt; }
  .btn { display:inline-block; padding:9pt 20pt; border-radius:8pt; color:#fff; font-weight:700; font-size:9.5pt; }
  .pill { display:inline-block; padding:4pt 9pt; border-radius:8pt; font-size:8.5pt; border:0.75pt solid; margin-right:4pt; }
  .link { font-size:9pt; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:7.5pt; text-transform:uppercase; letter-spacing:.6pt; color:#6B7280;
       border-bottom:0.75pt solid #1F2937; padding-bottom:3pt; }
  td { padding:3.5pt 6pt 3.5pt 0; border-bottom:0.5pt solid #D1D0C8; vertical-align:top; }
  .mono { font-family:Consolas,monospace; font-size:8.5pt; }
  .dd { display:grid; grid-template-columns:1fr 1fr; gap:14pt; margin-top:6pt; }
  .do, .dont { border-left:2.5pt solid; padding:7pt 10pt; background:#F9FAFB; }
  .do { border-color:#0F6E56; } .dont { border-color:#A32D2D; }
  .do h4, .dont h4 { margin:0 0 4pt; font-size:9pt; }
  .do h4 { color:#0F6E56; } .dont h4 { color:#A32D2D; }
  ul { margin:0; padding-left:13pt; } li { margin-bottom:3pt; }
  .foot { margin-top:14pt; padding-top:6pt; border-top:0.5pt solid #D1D0C8; font-size:7.5pt; color:#9CA3AF;
          display:flex; justify-content:space-between; }
</style></head><body>

<!-- Cover -->
<div class="page cover">
  <div>
    <div class="covermark">
      ${markSvg(74, 1.41, BRAND.fill, 225.28)}
      <span class="coverword">symetric</span>
    </div>
  </div>
  <div>
    <h1>Brand guide</h1>
    <p class="lede">Colour, mark, shape and voice — and the one rule that keeps
    the product honest.</p>
    <p class="small muted" style="margin-top:14pt">Version ${version} &middot; generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
    from the source files that define these values. The code is the source of
    truth; regenerate with <span class="mono">node scripts/make-brand-guide.mjs</span>.</p>
  </div>
</div>

<!-- The rule + mark -->
<div class="page">
  <h3>The one rule</h3>
  <div class="rule">
    <b>The brand colour and the data colours are separate systems.<br/>Neither may borrow from the other.</b>
    <p>A colour on a chart is a claim about which measurement you are looking at.
    If the app's chrome uses the same colour, the claim stops being trustworthy.</p>
  </div>
  <p>This has already gone wrong once. Until version 1.4.0 the accent was
  <span class="mono">#818cf8</span> — and so was the Mood domain. The same hex,
  in 71 places: one meant Mood, seventy meant "this is a button".</p>
  <p class="small muted">Reaching for a colour to identify a <b>measurement</b>?
  <span class="mono">src/lib/domains.ts</span>. For a <b>control, link or surface</b>?
  <span class="mono">src/constants/brand.ts</span>. An unrecognised factor takes the
  neutral <span class="mono">${UNKNOWN}</span> and must never fall back to the brand.</p>

  <h3>The mark</h3>
  <div style="display:flex; gap:18pt; align-items:center; margin-bottom:8pt;">
    ${markSvg(86, 1.41, BRAND.fill, 225.28)}
    ${markSvg(86, 1.41, BRAND.tile, 225.28)}
    <div style="background:${APP_BG};padding:10pt;border-radius:6pt;display:flex;align-items:center;gap:9pt">
      ${markSvg(30, 1.41, BRAND.tile, 225.28)}
      <span style="color:#e8eaf0;font-size:15pt;font-weight:600;letter-spacing:-0.3pt">symetric</span>
    </div>
  </div>
  <p>An <b>S</b> cut from a gradient of the domain colours: the mark is literally
  made of the palette the app measures with. Do not flatten it, re-order the
  stops, or recolour it for a campaign.</p>
  <table>
    <thead><tr><th>Context</th><th>Tile</th><th>Glyph fills</th></tr></thead>
    <tbody>
      <tr><td>In-app lockup</td><td class="mono">${BRAND.tile}</td><td>41%</td></tr>
      <tr><td>Launcher icon</td><td class="mono">${BRAND.fill}</td><td>58%</td></tr>
      <tr><td>Android adaptive foreground</td><td>transparent</td><td>50%, inside the safe zone</td></tr>
      <tr><td>Splash</td><td>transparent</td><td>88%</td></tr>
    </tbody>
  </table>
  <p class="small muted" style="margin-top:7pt">Two tiles on purpose: in-app the mark
  sits on a near-black screen, where a near-black tile is right. A home screen is
  not that — an almost-black icon disappears on a dark wallpaper. Every icon is
  generated from the component by <span class="mono">scripts/make-icons.mjs</span>.
  Regenerate, never redraw.</p>
  <div class="foot"><span>Symetric brand guide</span><span>${version}</span></div>
</div>

<!-- Brand colour -->
<div class="page">
  <h3>Brand colour</h3>
  <p>Teal, and specifically <span class="mono">${BRAND.fill}</span> — the same ink the
  PDF report already uses to mean "improved", so the app and the document it
  produces are one brand rather than two.</p>
  ${swatch('fill', BRAND.fill, 'Primary button, under a white label.')}
  ${tintRow(BRAND.fill)}
  ${swatch('text', BRAND.text, 'Links, icons, active labels.')}
  ${tintRow(BRAND.text)}
  ${swatch('fillAlt', BRAND.fillAlt, 'Gradient partner and secondary fills.')}
  ${swatch('textSoft', BRAND.textSoft, 'Larger or lower-emphasis accent text.')}
  ${swatch('textFlat', BRAND.textFlat, 'Settings accents, a touch flatter.')}
  <div class="foot"><span>Symetric brand guide</span><span>${version}</span></div>
</div>

<div class="page">
  <h3>Brand colour, continued</h3>
  ${swatch('border', BRAND.border, 'Accent card borders.')}
  ${swatch('surface', BRAND.surface, 'Accent card backgrounds.')}
  ${swatch('signIn', BRAND.signIn, 'The sign-in button, historically its own shade.')}
  ${swatch('tile', BRAND.tile, 'The in-app logo tile.')}

  <h3>In place</h3>
  <div class="situ">
    <div class="k">NEXT MIND CHECK-IN</div>
    <div style="font-size:22pt;font-weight:700;letter-spacing:-1pt">09:49</div>
    <div class="link" style="color:${BRAND.text};margin:5pt 0 9pt">Reschedule</div>
    <span class="btn" style="background:${BRAND.fill}">Check in now</span>
    <div style="margin-top:11pt">
      <span class="pill" style="background:${BRAND.text}26;border-color:${BRAND.text}66;color:${BRAND.text}">Concentration</span>
      <span class="pill" style="background:${DOMAINS.mood}26;border-color:${DOMAINS.mood}66;color:${DOMAINS.mood}">Mood</span>
      <span class="pill" style="background:#1e2333;border-color:#252b3b;color:#555c72">Irritability</span>
    </div>
    <div class="small" style="color:#4a5568;margin-top:7pt">Mood keeps its own colour. The accent no longer shares it.</div>
  </div>

  <h3>Washes</h3>
  <p class="small">Translucent accents go through <span class="mono">brandTint(BRAND.x, alpha)</span>.
  Never hand-write <span class="mono">rgba(...)</span>: forty-three of those were the reason
  the last colour change could not be done with search and replace, because raw
  channel numbers have no textual link to the colour they are a tint of.</p>
  <div class="foot"><span>Symetric brand guide</span><span>${version}</span></div>
</div>

<!-- Data colour -->
<div class="page">
  <h3>Data colour — mind domains</h3>
  <p>These identify measurements. They are not brand colours and change only if
  the meaning changes.</p>
  <div class="grid2">
    ${Object.entries(DOMAINS).map(([k, v]) => dataSwatch(k.replace(/_/g, ' '), v)).join('')}
  </div>

  <h3>Data colour — body, and the neutral</h3>
  <div class="grid2">
    ${dataSwatch('all body domains', BODY_COLOR)}
    ${dataSwatch('unknown factor', UNKNOWN)}
  </div>
  <p class="small muted" style="margin-top:6pt">Every body domain shares one colour,
  because body domains are read as a group against mind.</p>

  <h3>Adding a domain colour</h3>
  <p>Check it against the brand tokens <i>and</i> every existing domain using
  perceptual distance, not hue. Under <b>ΔE 15</b> is confusable at a glance. Hue
  alone will mislead you: a dark teal and a bright mint are 17° apart and never
  mistaken for each other.</p>
  <p class="small muted">For reference, the current brand fill sits
  ΔE ${nearestDomain(BRAND.fill).d.toFixed(0)} from the nearest data colour
  (${nearestDomain(BRAND.fill).n.replace(/_/g, ' ')}), and the link text
  ΔE ${nearestDomain(BRAND.text).d.toFixed(0)} from ${nearestDomain(BRAND.text).n.replace(/_/g, ' ')}.</p>

  <h3>Comfort mode</h3>
  <p class="small">A muted version of the same hue, for users who find the normal
  accent too loud. Derived from the brand — if the brand moves, these move with it.</p>
  <div class="grid2">
    ${dataSwatch('comfort fill', COMFORT.fill)}
    ${dataSwatch('comfort text', COMFORT.text)}
    ${dataSwatch('comfort border', COMFORT.border)}
  </div>
  <div class="foot"><span>Symetric brand guide</span><span>${version}</span></div>
</div>

<!-- Print + shape + type -->
<div class="page">
  <h3>Print colour</h3>
  <p>The PDF report has its own palette and does not use the app's tokens.
  <b>A screen colour chosen for a near-black background can be invisible on
  white</b> — the brand's ${BRAND.text} manages
  ${contrast(BRAND.text, '#ffffff').toFixed(1)}:1 there.</p>
  <div class="grid2">
    ${dataSwatch('ink', REPORT.text)}
    ${dataSwatch('muted', REPORT.muted)}
    ${dataSwatch('rules', REPORT.border)}
    ${dataSwatch('teal — improved', REPORT.teal)}
    ${dataSwatch('coral — concerning', REPORT.coral)}
    ${dataSwatch('amber — watch', REPORT.amber)}
  </div>

  <h3>Shape</h3>
  <table>
    <tbody>
      <tr><td style="width:60pt"><b>8pt</b></td><td>Chips, pills, tabs, filter controls, buttons</td></tr>
      <tr><td><b>12pt</b></td><td>Standard cards and inputs</td></tr>
      <tr><td><b>16–24pt</b></td><td>Hero cards and modals</td></tr>
      <tr><td><b>Circles</b></td><td>Stay circles: PIN keypad, comfort button, icon badges</td></tr>
    </tbody>
  </table>
  <p class="small muted" style="margin-top:6pt">Controls were capsule-shaped until 1.4.0.
  Eight reads as a control rather than a tag, and echoes the cards behind it.</p>

  <h3>Typography</h3>
  <p><b>There is no brand typeface, and this is a known gap.</b> The app uses each
  platform's system font. The report asks for
  <span class="mono">Roboto, "Noto Sans", Helvetica, Arial</span> — Roboto first so
  Android's substitution is deliberate rather than accidental.</p>
  <p class="small muted">This matters more than it sounds: Android has neither
  Helvetica nor Arial, and the same report paginated differently on the two
  platforms — five of eleven pages overflowed under an Android-like font while
  all eleven fitted under Helvetica. Page budgets are fitted to the wider of the
  two. Adding a typeface means re-running
  <span class="mono">scripts/report-layout/</span>.</p>
  <div class="foot"><span>Symetric brand guide</span><span>${version}</span></div>
</div>

<!-- Voice, access, gaps -->
<div class="page">
  <h3>Voice</h3>
  <p>Calm, plain-spoken, low-hype. No exclamation points, no emoji, no
  empowerment language. Speaks like a competent friend, not a wellness brand.
  Sentences say what will happen — "takes about 20 seconds each time" — rather
  than selling a feeling.</p>
  <div class="dd">
    <div class="do"><h4>Do</h4><ul>
      <li>Say what was measured, and over how many days</li>
      <li>Let a null result be a result</li>
      <li>Treat a baseline as typical for that person</li>
    </ul></div>
    <div class="dont"><h4>Don't</h4><ul>
      <li>Imply cause from correlation</li>
      <li>Call a baseline "fine" or "normal"</li>
      <li>Congratulate someone on their symptoms</li>
    </ul></div>
  </div>
  <p class="small muted" style="margin-top:8pt">The audience is managing a chronic
  illness, has often been dismissed for years, and has been sold to enough.</p>

  <h3>Accessibility</h3>
  <p class="small">Floors: <b>4.5:1</b> for body text, <b>3:1</b> for large or bold.
  Every brand token meets them in the direction it is used. Colour is never the
  only signal — charts carry labels and numbers, findings carry a confidence
  word as well as a tier colour.</p>
  <table>
    <thead><tr><th>Pairing</th><th>Ratio</th></tr></thead>
    <tbody>
      <tr><td>White on brand fill</td><td><b>${contrast('#ffffff', BRAND.fill).toFixed(1)}:1</b></td></tr>
      <tr><td>Brand text on app background</td><td><b>${contrast(BRAND.text, APP_BG).toFixed(1)}:1</b></td></tr>
      <tr><td>White on comfort fill</td><td><b>${contrast('#ffffff', COMFORT.fill).toFixed(1)}:1</b></td></tr>
      <tr><td>Comfort text on app background</td><td><b>${contrast(COMFORT.text, APP_BG).toFixed(1)}:1</b></td></tr>
    </tbody>
  </table>

  <h3>Not settled</h3>
  <ul>
    <li><b>No brand typeface.</b> The largest open question here.</li>
    <li><b>Store screenshots</b> — 17 artboards still show the old accent and the placeholder icon.</li>
    <li><b>The report's mind-line ink</b> is thin on white.</li>
    <li><b>Voice</b> is documented but inferred from in-product copy, not confirmed.</li>
  </ul>
  <div class="foot"><span>Symetric brand guide</span><span>${version}</span></div>
</div>

</body></html>`;

const htmlPath = join(tmpdir(), `brand-guide-${Date.now()}.html`);
writeFileSync(htmlPath, html);

const chrome = CHROME_CANDIDATES.find(c => { try { readFileSync(c); return true; } catch { return false; } });
if (!chrome) { console.error('No Chrome or Edge found; cannot render the PDF.'); process.exit(2); }

const out = join(ROOT, 'docs/symetric-brand-guide.pdf');
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--no-pdf-header-footer', `--print-to-pdf=${out}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`,
], { stdio: ['ignore', 'ignore', 'ignore'] });

console.log(`docs/symetric-brand-guide.pdf  (version ${version})`);
console.log(`  brand tokens   ${Object.keys(BRAND).length}`);
console.log(`  mind domains   ${Object.keys(DOMAINS).length}`);
console.log(`  print colours  ${Object.keys(REPORT).length}`);
