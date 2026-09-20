// Measures a report document's page fill with a real engine.
//
// The page budgets in this report were derived by arithmetic (a sparkline row
// is about 83pt, a Letter page holds about 616pt of body) because the engine
// that decides is a print WebView that cannot be run from a build machine.
// Chromium is the same engine family as Android's WebView, so a headless
// render is both a layout regression check and a reasonable proxy for how the
// Android PDF will paginate.
//
// Runs the page through a browser with the printable width applied, measures
// every .page element, and reports anything that would spill onto a second
// physical sheet — which is how the "Page 3 of 10" in the header stops being
// true.
//
// Usage: node measure-report.mjs <file.html> [--font "Roboto, sans-serif"]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

// US Letter at 72pt/in, which is what printToFileAsync defaults to, minus the
// report's own @page margins (48 top, 60 bottom, 54 each side).
const PAGE_W_PT = 612, PAGE_H_PT = 792;
const MARGIN = { top: 48, bottom: 60, left: 54, right: 54 };
const CONTENT_W_PT = PAGE_W_PT - MARGIN.left - MARGIN.right;   // 504
const CONTENT_H_PT = PAGE_H_PT - MARGIN.top - MARGIN.bottom;   // 684
const PT_PER_PX = 0.75;

const htmlPath = process.argv[2];
const fontIdx = process.argv.indexOf('--font');
const fontOverride = fontIdx > -1 ? process.argv[fontIdx + 1] : null;

let html = readFileSync(htmlPath, 'utf8');

// Constrain to the printable width and measure each logical page.
const probe = `
<style>
  body { width: ${CONTENT_W_PT}pt !important; margin: 0 !important; }
  ${fontOverride ? `body, body * { font-family: ${fontOverride} !important; }` : ''}
</style>
<script>
  window.addEventListener('load', () => {
    const out = [...document.querySelectorAll('.page')].map((el, i) => {
      const title = el.querySelector('.section-title');
      return {
        n: i + 1,
        title: title ? title.textContent : '(untitled)',
        heightPt: +(el.getBoundingClientRect().height * ${PT_PER_PX}).toFixed(1),
      };
    });
    const el = document.createElement('div');
    el.id = 'measurements';
    el.textContent = JSON.stringify(out);
    document.body.appendChild(el);
  });
</script>`;
html = html.replace('</head>', `${probe}</head>`);

const probePath = join(tmpdir(), `report-probe-${Date.now()}.html`);
writeFileSync(probePath, html);

const browser = BROWSERS.find(b => { try { readFileSync(b); return true; } catch { return false; } });
if (!browser) { console.error('No Chrome or Edge found.'); process.exit(2); }

const dom = execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000',
  '--dump-dom', `file:///${probePath.replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const match = dom.match(/<div id="measurements">(.*?)<\/div>/s);
if (!match) { console.error('Could not read measurements from the rendered DOM.'); process.exit(2); }

const pages = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

console.log(`engine: ${browser.includes('chrome.exe') ? 'Chrome' : 'Edge'}${fontOverride ? `  font: ${fontOverride}` : '  font: as authored'}`);
console.log(`printable area: ${CONTENT_W_PT} x ${CONTENT_H_PT} pt\n`);

let over = 0;
for (const p of pages) {
  const sheets = Math.max(1, Math.ceil(p.heightPt / CONTENT_H_PT));
  const fill = Math.round((p.heightPt / CONTENT_H_PT) * 100);
  const flag = sheets > 1 ? `  <-- OVERFLOWS onto ${sheets} sheets` : (fill > 90 ? '  <-- tight' : '');
  if (sheets > 1) over++;
  console.log(`  ${String(p.n).padStart(2)}. ${p.title.padEnd(28)} ${String(p.heightPt).padStart(7)}pt  ${String(fill).padStart(3)}% of a sheet${flag}`);
}

console.log('');
console.log(over === 0 ? 'PASS - every logical page fits one sheet' : `FAIL - ${over} page(s) overflow`);
process.exit(over === 0 ? 0 : 1);
