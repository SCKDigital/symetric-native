// Regenerates the app icons from the real Symetric mark.
//
// What was there: Expo's template placeholder. The iOS .icon bundle is
// literally "expo-symbol 2.svg" plus a grid.png on Expo's default blue, and
// the PNGs are a blue chevron. None of it is this app's logo.
//
// Geometry, gradient and path are read from components/symetric-logo.tsx so
// the icon and the in-app mark cannot drift apart.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const NATIVE = 'C:/Users/Sam/symetric-native';
const OUT = `${NATIVE}/assets/images`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const logo = readFileSync(`${NATIVE}/src/components/symetric-logo.tsx`, 'utf8');
const accents = readFileSync(`${NATIVE}/src/constants/accents.ts`, 'utf8');

const MARK_PATH = logo.match(/const MARK_PATH =\s*'([^']+)'/)[1];
const TRANSFORM = logo.match(/transform="(translate\([^"]+\))"/)[1];
const STOPS = [...logo.matchAll(/offset="(\d+)%" stopColor="(#[0-9A-Fa-f]{6})"/g)]
  .map(m => `<stop offset="${m[1]}%" stop-color="${m[2]}"/>`).join('');
const GRAD = logo.match(/<LinearGradient[^>]*x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/);

// ── The launcher tile ──────────────────────────────────────────────────────
//
// The DEFAULT accent's `tile`, read out of constants/accents.ts. A runtime
// preference cannot reach a PNG, so the home screen wears whatever ships.
//
// It used to be the accent's `fill`, on the reasoning that an almost-black
// icon disappears against a dark wallpaper. That reasoning does not survive
// the move to porcelain, and measuring it showed the old rule was costing
// more than it bought. The mark is a gradient of seven light, saturated
// domain colours, so what it needs is a DARK ground:
//
//   tile                      worst gradient stop   best
//   porcelain fill  #E7E2D9          1.29:1        2.11:1   <- unreadable
//   teal fill       #0F6E56          2.28:1        3.72:1   <- what shipped
//   porcelain tile  #2A251C          5.34:1        8.71:1
//
// On the near-white fill the S is barely there. The trade is separation from
// a dark wallpaper (1.4:1 against pure black, against the teal's 3.4:1), and
// it is worth taking: both platforms mask and shade the icon themselves, a
// pure-black wallpaper is the worst case rather than the common one, and an
// icon you cannot read is worse than one that sits quietly. This also makes
// the launcher icon and the in-app lockup the same tile for the first time.
//
// Resolved through DEFAULT_ACCENT rather than by taking the first `tile:` in
// the file, so reordering the palette cannot silently repaint the icon.
const DEFAULT_ACCENT = accents.split("DEFAULT_ACCENT: AccentName = '")[1].split("'")[0];
// Sliced rather than matched: the block is delimited by its own indentation,
// and a regex for that is harder to read than the two splits it replaces.
const ACCENT_BLOCK = accents.split(`\n  ${DEFAULT_ACCENT}: {\n`)[1];
if (!ACCENT_BLOCK) throw new Error(`no accent block for '${DEFAULT_ACCENT}' in accents.ts`);
const FILL = ACCENT_BLOCK.split('\n  },')[0].match(/tile: '(#[0-9A-Fa-f]{6})'/)[1];

/** The mark alone, on a transparent ground, filling `scale` of the canvas. */
function markSvg(size, scale) {
  const span = 1024 * scale;
  const offset = (1024 - span) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${GRAD[1]}" y1="${GRAD[2]}" x2="${GRAD[3]}" y2="${GRAD[4]}">${STOPS}</linearGradient></defs>
    <g transform="translate(${offset},${offset}) scale(${scale})">
      <g transform="${TRANSFORM}"><path d="${MARK_PATH}" fill="url(#g)"/></g>
    </g>
  </svg>`;
}

function tileSvg(size, radius, scale) {
  const span = 1024 * scale;
  const offset = (1024 - span) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${GRAD[1]}" y1="${GRAD[2]}" x2="${GRAD[3]}" y2="${GRAD[4]}">${STOPS}</linearGradient></defs>
    <rect width="1024" height="1024" rx="${radius}" fill="${FILL}"/>
    <g transform="translate(${offset},${offset}) scale(${scale})">
      <g transform="${TRANSFORM}"><path d="${MARK_PATH}" fill="url(#g)"/></g>
    </g>
  </svg>`;
}

/** Solid, for the Android adaptive background layer. */
function solidSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${FILL}"/></svg>`;
}

/** White silhouette, which Android tints itself for themed icons. */
function monoSvg(size, scale) {
  const span = 1024 * scale;
  const offset = (1024 - span) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <g transform="translate(${offset},${offset}) scale(${scale})">
      <g transform="${TRANSFORM}"><path d="${MARK_PATH}" fill="#ffffff"/></g>
    </g>
  </svg>`;
}

function shoot(svg, w, h, outPath, transparent) {
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:${transparent ? 'transparent' : FILL};}
    svg{display:block}
  </style></head><body>${svg}</body></html>`;
  const tmp = join(tmpdir(), `icon-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(tmp, html);
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${w},${h}`, `--screenshot=${outPath}`,
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push(`file:///${tmp.replace(/\\/g, '/')}`);
  execFileSync(CHROME, args, { stdio: ['ignore', 'ignore', 'ignore'] });
  console.log(`  ${outPath.split('/').pop().padEnd(32)} ${w}x${h}`);
}

console.log(`mark + gradient read from symetric-logo.tsx; tile ${FILL} read from accents.ts\n`);

// Universal icon, and the iOS fallback. 22% corner radius matches the mark's own tile.
shoot(tileSvg(1024, 225.28, 1.41), 1024, 1024, `${OUT}/icon.png`, false);        // 58% of the tile
// Android adaptive: background is a flat colour, foreground is the mark with
// the safe-zone margin the platform crops to.
shoot(solidSvg(512), 512, 512, `${OUT}/android-icon-background.png`, false);
shoot(markSvg(512, 1.21), 512, 512, `${OUT}/android-icon-foreground.png`, true); // 50%, inside the adaptive safe zone
shoot(monoSvg(512, 1.21), 512, 512, `${OUT}/android-icon-monochrome.png`, true);
shoot(tileSvg(48, 10.5, 1.41), 48, 48, `${OUT}/favicon.png`, false);
// Splash sits on the app's own background, so the mark alone.
shoot(markSvg(228, 2.14), 228, 228, `${OUT}/splash-icon.png`, true);            // 88%, it is the whole splash

// ── iOS .icon bundle ───────────────────────────────────────────────────────
const ios = `${NATIVE}/assets/expo.icon`;
mkdirSync(`${ios}/Assets`, { recursive: true });
writeFileSync(`${ios}/Assets/symetric-mark.svg`, markSvg(1024, 1.41));

const [r, g, b] = [1, 3, 5].map(i => (parseInt(FILL.slice(i, i + 2), 16) / 255).toFixed(5));
writeFileSync(`${ios}/icon.json`, JSON.stringify({
  fill: { 'automatic-gradient': `extended-srgb:${r},${g},${b},1.00000` },
  groups: [{ layers: [{ 'image-name': 'symetric-mark.svg', name: 'symetric-mark' }] }],
  'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
}, null, 2) + '\n');
console.log(`  expo.icon/                       fill ${FILL} -> extended-srgb ${r},${g},${b}`);
