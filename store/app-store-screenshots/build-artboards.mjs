// Generates the App Store screenshot artboards (.dc.html) for Symetric, and
// re-seeds the design canvas page (symetric-app-store-screenshots.html).
//
// Every colour, font size, radius and spacing inside the phone is lifted from
// the app's own screens in src/ -- the app people actually install. The first
// set (18 Sep 2026) was traced from the obsolete web PWA and showed the indigo
// accent; the app has since moved to a user-chosen accent with porcelain as
// the default (v1.5.0, see docs/brand.md). The files named above each screen
// below are paths in this repo. Edit here, then `node build-artboards.mjs`
// from this folder.
import { readFileSync, writeFileSync } from 'node:fs';

// -- Porcelain, the default accent (src/constants/accents.ts) ----------------
// Screenshots wear the default because that is what a new install looks like.
const FILL = '#E7E2D9';      // primary button
const ON_FILL = '#0A0C12';   // label on FILL -- porcelain is the one accent that inverts
const FILL_ALT = '#CFC7B6';  // secondary fills, switch track, slider value
const ACCENT = '#C8B79A';    // accent text: links, active tab, eyebrows
const SOFT = '#DACEB8';      // larger / lower-emphasis accent text
const FLAT = '#B5A386';      // settings icons and pills
const A_BORDER = '#3A3229';  // accent card borders
const SURFACE = '#14120E';   // accent card background
const TILE = '#2A251C';      // the logo tile
const QUIET = { fill: '#BDB4A5', onFill: '#0A0C12', text: '#A99C86', border: '#2E2921' };

// -- App neutrals (shared across the screens below) ---------------------------
const GROUND = '#0a0c12';
const CARD = '#141820';
const BORDER = '#1e2533';
const TEXT = '#e2e8f0';

// -- Data colours (src/lib/domains.ts) -- these never follow the accent ------
const DOMAIN = {
  mood: '#818cf8', energy: '#34d399', anxiety: '#fb923c', concentration: '#38bdf8',
  irritability: '#f472b6', social_battery: '#a78bfa', sensory_sensitivity: '#fbbf24',
  motivation: '#c084fc', sleep: '#7B9EB8',
};
const BODY_COLOR = '#BC812F';

// The tick inside a checked domain checkbox. onboarding-controls.tsx draws it
// in a hard-coded '#fff', which was fine on indigo and is close to invisible on
// porcelain's near-white fill. Reproduced as the app has it; change this to
// ON_FILL once the app reads accent.onFill there.
const CHECKBOX_TICK = '#fff';

// brandTint() from src/constants/brand.ts.
const tint = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

// comfort-theme.ts: fs() in comfort mode -- x1.15, rounded to a half point.
const cfs = (size) => Math.round(size * 1.15 * 2) / 2;

// -- Type --------------------------------------------------------------------
// The app sets no typeface: it is the platform system font (SF Pro on iOS).
// Inter is the closest web stand-in and renders the same on every machine
// that exports these, which SF would not. DM Mono is named in the slider
// styles but never loaded, so iOS falls back to the system font there too.
const FONT = "'Inter', -apple-system, 'SF Pro Text', system-ui, sans-serif";

// -- Marketing layer: the homepage's colour direction 2b ---------------------
// https://claude.ai/artifact/E3Jj9Q9gsQtkDw4kbXBD8x (Desktop · 2b). Everything
// OUTSIDE the phone follows the site: DM Sans 700 headings, off-white as the
// base accent, and each card borrowing one mind colour -- spread so all eight
// appear and purple never leads. The site only spends those colours small
// (eyebrows, dots, 44px bars), never on a headline: they are tuned as chart
// strokes and glare at caption size. So a card gets its colour as one short
// bar above the caption. Flat grounds, no gradients. Warm brown surfaces go to
// neutral slate. Everything INSIDE the phone stays the app's own (Inter,
// porcelain), because that is what an install looks like.
const DISPLAY = "'DM Sans', system-ui, sans-serif";
const SLATE_TILE = '#1B2030';
const SITE = { card: '#151922', rule: '#252B3B', ink2: '#B0B8C8', mute: '#8892A4' };
const MIND = {
  mood: '#818cf8', energy: '#34d399', anxiety: '#fb923c', concentration: '#38bdf8',
  irritability: '#f472b6', social: '#a78bfa', sensory: '#fbbf24', motivation: '#c084fc',
};
const eyebrow = (text, color) => `<p style="margin: 0; font-family: ${DISPLAY}; font-size: 34px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${color}; text-align: center;">${text}</p>`;
const NUM = 'font-variant-numeric: tabular-nums;';

// -- Device geometry ---------------------------------------------------------
// The phone renders the app at its true 402pt width and is scaled up for the
// 1290x2796 store frame, so every value inside stays the app's own. The
// headline zone is a fixed 450px so every caption's first line sits at the
// same height, whether it runs to two lines or three.
const APP_W = 402, APP_H = 915;
const SCREEN_W = 994, SCREEN_H = 2262;
const SCALE = (SCREEN_W / APP_W).toFixed(6);
const HEAD_H = 450, DEVICE_H = 2286;
const SAFE_TOP = 59, TAB_H = 83, HOME_H = 34;

// src/components/symetric-logo.tsx -- the mark, on the accent's tile.
const MARK_PATH = 'M0.0 153.6022253129346H55.6884561891516Q56.912378303198885 165.53546592489568 63.94993045897078 171.80806675938803Q70.98748261474269 178.08066759388038 82.3087621696801 178.08066759388038Q93.93602225312934 178.08066759388038 100.66759388038942 172.72600834492349Q107.3991655076495 167.3713490959666 107.3991655076495 157.8859527121001Q107.3991655076495 149.93045897079276 102.04450625869262 144.72878998609178Q96.68984700973573 139.5271210013908 88.88734353268427 136.16133518776076Q81.08484005563281 132.7955493741307 66.70375521557717 128.5118219749652Q45.89707927677329 122.08623087621694 32.739916550764946 115.66063977746867Q19.582753824756608 109.23504867872042 10.097357440890125 96.68984700973573Q0.6119610570236436 84.14464534075103 0.6119610570236436 63.94993045897078Q0.6119610570236436 33.963838664812215 22.336578581363003 16.981919332406108Q44.061196105702365 0.0 78.94297635605005 0.0Q114.4367176634214 0.0 136.16133518776076 16.981919332406108Q157.88595271210013 33.963838664812215 159.41585535465924 64.2559109874826H102.80945757997218Q102.19749652294853 53.85257301808065 95.15994436717662 47.88595271210012Q88.12239221140472 41.919332406119594 77.10709318497912 41.919332406119594Q67.62169680111265 41.919332406119594 61.808066759388026 46.96801112656466Q55.99443671766341 52.01668984700973 55.99443671766341 61.50208623087619Q55.99443671766341 71.90542420027813 65.78581363004172 77.71905424200276Q75.57719054242001 83.53268428372738 96.3838664812239 90.26425591098746Q117.1905424200278 97.30180806675936 130.19471488178024 103.72739916550762Q143.19888734353268 110.15299026425589 152.68428372739916 122.39221140472877Q162.16968011126565 134.63143254520165 162.16968011126565 153.90820584144643Q162.16968011126565 172.26703755215573 152.83727399165508 187.26008344923503Q143.5048678720445 202.2531293463143 125.75799721835884 211.12656467315713Q108.01112656467315 219.99999999999997 83.8386648122392 219.99999999999997Q60.278164116828926 219.99999999999997 41.61335187760778 212.35048678720443Q22.94853963838665 204.70097357440886 11.780250347705145 189.7079276773296Q0.6119610570236436 174.71488178025032 0.0 153.6022253129346Z';

const logo = (id, size, tile = TILE) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 1024 1024" style="flex-shrink: 0; display: block;">' +
  '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="220" x2="162.17" y2="0">' +
  '<stop offset="0%" stop-color="#22D3EE"></stop><stop offset="17%" stop-color="#34D399"></stop>' +
  '<stop offset="34%" stop-color="#60A5FA"></stop><stop offset="50%" stop-color="#A78BFA"></stop>' +
  '<stop offset="67%" stop-color="#F472B6"></stop><stop offset="84%" stop-color="#FB923C"></stop>' +
  '<stop offset="100%" stop-color="#FBBF24"></stop></linearGradient></defs>' +
  '<rect width="1024" height="1024" rx="225.28" fill="' + tile + '"></rect>' +
  '<g transform="translate(300.65,225.28) scale(2.60655)"><path d="' + MARK_PATH + '" fill="url(#' + id + ')"></path></g></svg>';

// src/components/shared/app-logo-header.tsx -- on Today, History, Insights, Settings.
const logoHeader = (id, trailing = '') => `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${logo(id, 28)}
              <span style="font-weight: 600; font-size: 18px; color: ${TEXT}; letter-spacing: -0.36px;">symetric</span>
            </div>
            ${trailing}
          </div>`;

// src/components/nav-icons.tsx; tab colours from src/components/app-tabs.tsx.
const NAV = {
  today: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"></path><path d="M9 21V12h6v9"></path>',
  history: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 15"></polyline>',
  insights: '<path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path>',
  prepare: '<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
};
const NAV_LABELS = { today: 'Today', history: 'History', insights: 'Insights', prepare: 'Prepare', settings: 'Settings' };
const NAV_INACTIVE = '#4a5568';

// Standard expo-router Tabs: 49pt bar plus the 34pt home-indicator inset,
// active tint = accent text, labels 10pt and NOT bolded when active.
const tabBar = (active) => `<div style="position: absolute; bottom: 0; left: 0; right: 0; height: ${TAB_H}px; box-sizing: border-box; background: ${GROUND}; border-top: 0.5px solid ${BORDER}; display: flex; z-index: 5;">
          ${Object.keys(NAV).map((k) => {
            const c = k === active ? ACCENT : NAV_INACTIVE;
            return `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding-top: 7px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV[k]}</svg>
            <span style="font-size: 10px; letter-spacing: 0.2px; color: ${c}; margin-top: 3px;">${NAV_LABELS[k]}</span>
          </div>`;
          }).join('\n          ')}
        </div>`;

// iOS chrome: status bar and home indicator. Not app UI, but a store frame
// without them reads as a mock-up rather than a phone.
const statusBar = `<div style="position: absolute; top: 0; left: 0; right: 0; height: 54px; z-index: 6; pointer-events: none;">
          <span style="position: absolute; left: 0; width: 132px; top: 18px; text-align: center; font-size: 17px; font-weight: 600; color: #fff; letter-spacing: -0.2px;">9:41</span>
          <div style="position: absolute; right: 28px; top: 22px; display: flex; align-items: center; gap: 6px;">
            <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="0.8" fill="#fff"></rect><rect x="5" y="5.5" width="3" height="6.5" rx="0.8" fill="#fff"></rect><rect x="10" y="3" width="3" height="9" rx="0.8" fill="#fff"></rect><rect x="15" y="0" width="3" height="12" rx="0.8" fill="#fff"></rect></svg>
            <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5l2.4-2.9a3.6 3.6 0 0 0-4.8 0z" fill="#fff"></path><path d="M3.9 6.6a6.1 6.1 0 0 1 8.2 0l1.4-1.7a8.4 8.4 0 0 0-11 0z" fill="#fff"></path><path d="M1.5 3.7a9.8 9.8 0 0 1 13 0L16 2A12 12 0 0 0 0 2z" fill="#fff"></path></svg>
            <svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="rgba(255,255,255,0.4)"></rect><rect x="2" y="2" width="20" height="9" rx="2" fill="#fff"></rect><path d="M25 4.5v4a2.2 2.2 0 0 0 0-4z" fill="rgba(255,255,255,0.45)"></path></svg>
          </div>
        </div>`;
const homeIndicator = `<div style="position: absolute; bottom: 8px; left: 50%; width: 134px; height: 5px; margin-left: -67px; border-radius: 3px; background: ${TEXT}; z-index: 7;"></div>`;

// -- Shared app pieces ------------------------------------------------------

// src/components/shared/chevrons.tsx
const chevronRight = (size = 10, color = '#6b7a99') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
const chevronDown = (size = 12, color = '#8892a4') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

// src/components/shared/highlighted-sentence.tsx -- the factor's own data colour.
const hl = (text, color) => `<span style="color: ${color};">${text}</span>`;

// src/components/today/comfort-controls.tsx -- ComfortButton.
const comfortButton = (active) => `<div style="width: 34px; height: 34px; box-sizing: border-box; border-radius: 17px; border: 1px solid ${active ? tint(ACCENT, 0.28) : 'transparent'}; background: ${active ? tint(FILL, 0.22) : 'transparent'}; display: flex; align-items: center; justify-content: center;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${active ? '#cbd5e0' : '#7886a0'}" stroke-width="1.6"></circle><path d="M8.5 13.5a4 4 0 0 0 7 0" stroke="${active ? '#cbd5e0' : '#7886a0'}" stroke-width="1.6" stroke-linecap="round"></path></svg>
            </div>`;

// src/app/index.tsx -- formatDate(): en-GB short, upper-cased.
const TODAY_LABEL = 'THU 22 OCT';
const todayHeader = (id, comfortOn) => logoHeader(id, `<div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 12px; color: #8892a4; letter-spacing: 0.5px;">${TODAY_LABEL}</span>
              ${comfortButton(comfortOn)}
            </div>`);

// src/components/checkin/domain-slider.tsx. The thumb is the native UISlider
// thumb tinted with the accent; it travels inside the track's ends, while the
// gradient fill is a percentage of the full width -- both as the app draws them.
function slider(o) {
  const frac = (o.value - 1) / 9;
  const base = o.baseline == null ? '' :
    `<div style="position: absolute; top: 50%; left: ${((o.baseline - 1) / 9) * 100}%; width: 2px; height: 12px; margin-top: -6px; margin-left: -1px; background: #4a5568; border-radius: 1px; z-index: 1;"></div>`;
  return `<div style="border-left: 3px solid ${o.color}; padding-left: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 14px; color: #cbd5e0;">${o.label}</span>
                  <span style="font-size: 13px; color: ${FILL_ALT}; font-weight: 500; ${NUM}">${o.value}</span>
                </div>
                <div style="position: relative; height: 40px;">
                  <div style="position: absolute; top: 18px; left: 0; right: 0; height: 4px; border-radius: 2px; background: #2d3748; overflow: hidden;">
                    <div style="height: 100%; width: ${frac * 100}%; background: linear-gradient(90deg, ${FILL}, ${ACCENT}); border-radius: 2px;"></div>
                  </div>
                  ${base}
                  <div style="position: absolute; top: 6px; left: calc(${frac} * (100% - 28px)); width: 28px; height: 28px; border-radius: 50%; background: ${ACCENT}; box-shadow: 0 0.5px 4px rgba(0,0,0,0.35), 0 3px 8px rgba(0,0,0,0.25); z-index: 2;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                  <span style="font-size: 11px; color: #4a5568; ${NUM}">1</span>
                  <span style="font-size: 11px; color: #4a5568; ${NUM}">10</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <span style="font-size: 10px; color: #4a5568; opacity: 0.7; max-width: 45%; line-height: 13px;">${o.low}</span>
                  <span style="font-size: 10px; color: #4a5568; opacity: 0.7; max-width: 45%; line-height: 13px; text-align: right;">${o.high}</span>
                </div>
              </div>`;
}

// -- Artboard shell ----------------------------------------------------------
// `lines` is the headline, one entry per rendered line; the LAST line carries
// the accent, so the payoff is the coloured half. Three-line captions drop to
// 76px so they still clear the phone.
//
// `app` describes the phone screen:
//   top    -- where the app's content box starts: SAFE_TOP under a
//             SafeAreaView, 0 for the check-in form, which has none
//   tab    -- the active tab, or null for a full-screen modal
//   bg     -- the screen's own root background
//   scroll -- how far the content is scrolled, in points
//   body   -- the content, laid out at 402pt wide
function artboard({ lines, app, accent }) {
  const size = lines.length >= 3 ? 76 : 88;
  // The set-up lines sit back in grey; the payoff carries the full ink.
  const head = lines.map((l, i) => i === lines.length - 1
    ? `<span style="color: ${TEXT};">${l}</span>`
    : `<span style="color: ${SITE.mute};">${l}</span><br>`).join('');
  return dcPage(`<div style="width: 1290px; height: 2796px; box-sizing: border-box; background: ${GROUND}; position: relative; overflow: hidden; font-family: ${FONT};">

  <div style="height: ${HEAD_H}px; box-sizing: border-box; padding: 120px 96px 0; display: flex; flex-direction: column; align-items: center;">
    ${colourBar(accent)}
    <h1 style="margin: 0; font-family: ${DISPLAY}; font-size: ${size}px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: ${TEXT}; text-align: center;">${head}</h1>
  </div>

  ${device(app, 'margin: 0 auto;')}
</div>`);
}

// A card's one dose of its mind colour: the site's .gbar, at store scale.
const colourBar = (c) => `<span style="display: block; width: 96px; height: 10px; border-radius: 5px; background: ${c}; margin-bottom: 40px;"></span>`;

// The .dc.html wrapper around one 1290x2796 card.
const dcPage = (card) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&amp;family=Inter:wght@300;400;500;600;700&amp;display=swap">
  <style>
    body { margin: 0; font-family: ${FONT}; }
    a { color: ${ACCENT}; }
    a:hover { color: ${SOFT}; }
  </style>
</helmet>
${card}
</x-dc>
</body>
</html>
`;

// The phone, 1018 x DEVICE_H, with the app screen inside. `style` places it.
function device(app, style) {
  // A full-screen modal's SafeAreaView takes the bottom edge as well as the top.
  const bottom = app.tab ? TAB_H : HOME_H;
  return `<div style="width: 1018px; height: ${DEVICE_H}px; box-sizing: border-box; ${style} border-radius: 76px; background: #1c1f26; padding: 12px; box-shadow: 0 40px 120px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.06);">
    <div style="width: ${SCREEN_W}px; height: ${SCREEN_H}px; border-radius: 64px; overflow: hidden; background: ${app.bg}; position: relative;">
      <div style="width: ${APP_W}px; height: ${APP_H}px; transform: scale(${SCALE}); transform-origin: top left; background: ${app.bg}; position: relative; overflow: hidden; color: ${TEXT};">
        <div style="position: absolute; top: ${app.top}px; left: 0; right: 0; bottom: ${bottom}px; overflow: hidden;">
          <div style="transform: translateY(-${app.scroll ?? 0}px);">
${app.body}
          </div>
        </div>
        ${statusBar}
        ${app.tab ? tabBar(app.tab) : ''}
        ${homeIndicator}
      </div>
    </div>
  </div>`;
}

const screens = {};
const boards = {};

// === Today ==================================================================
// src/app/index.tsx (TodayHome, nothing due), today/sleep-card.tsx (logged),
// today/bonus-check-in-card.tsx, today/body-check-in-cards.tsx (not yet open).
// A due check-in takes the whole screen in the native app, so the dashboard is
// shown here in its between-check-ins state, which is what it looks like most
// of the day.
const dot = (on) => `<span style="width: 8px; height: 8px; border-radius: 4px; background: ${on ? ACCENT : '#2d3748'};"></span>`;

screens.today = {
  top: SAFE_TOP, tab: 'today', bg: GROUND,
  body: `        <div style="padding: 20px 24px 0;">
          ${todayHeader('mk-today', false)}

          <div style="border: 1px solid ${tint(SOFT, 0.25)}; border-radius: 8px; padding: 11px 14px; text-align: center; margin-bottom: 20px;">
            <span style="font-size: 13px; font-weight: 500; color: ${SOFT};">+ Add an event</span>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="background: #0f1117; border: 1px solid #1a2030; border-radius: 16px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; opacity: 0.7;">
              <div>
                <p style="font-size: 11px; color: #8892a4; letter-spacing: 0.9px; margin: 0 0 3px;">SLEEP · LOGGED</p>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 15px; color: #9aabb8;">Well</span>
                  <span style="display: flex; align-items: center; gap: 3px;">${[1, 2, 3, 4, 5].map((i) => dot(i <= 4)).join('')}</span>
                  <span style="font-size: 15px; color: #6b7688;">· 7.5h</span>
                </div>
              </div>
              <span style="font-size: 14px; color: #2d3748;">✓</span>
            </div>
          </div>

          <div style="padding-top: 12px; margin-bottom: 24px;">
            <p style="font-size: 13px; color: #b0b8c8; letter-spacing: 1px; margin: 0 0 6px;">NEXT MIND CHECK-IN</p>
            <p style="font-size: 32px; font-weight: 700; color: #dde4f0; letter-spacing: -1px; margin: 0; ${NUM}">2:40 pm</p>
            <p style="font-size: 14px; color: #8892a4; margin: 4px 0 0;">then 6:15 pm</p>
            <p style="font-size: 13px; color: #4a5568; margin: 0; padding-top: 10px;">Reschedule</p>
          </div>

          <div style="background: ${tint(FILL_ALT, 0.06)}; border: 1px solid ${tint(FILL_ALT, 0.15)}; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 13px; color: ${ACCENT};">Edit last check-in</span>
            <span style="font-size: 11px; color: #4a5568;">6 min remaining</span>
          </div>

          <div style="border: 1px solid ${BORDER}; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 14px; color: #b8c4d8;">Log a bonus mind check-in</span>
            <span style="font-size: 18px; color: #64748b; line-height: 20px;">+</span>
          </div>

          <div style="margin-top: 16px; background: ${SURFACE}; border: 1px solid ${A_BORDER}; border-radius: 24px; padding: 32px 28px 28px; display: flex; flex-direction: column; gap: 24px; opacity: 0.45;">
            <p style="font-size: 12px; color: ${ACCENT}; letter-spacing: 1.4px; font-weight: 700; margin: 0 0 12px;">BODY CHECK-IN</p>
            <p style="font-size: 22px; color: ${TEXT}; font-weight: 600; letter-spacing: -0.4px; margin: 0;">Opens at 6:00pm</p>
          </div>
        </div>`,
};

// === Mind check-in ==========================================================
// src/components/checkin/check-in-form.tsx + domain-slider.tsx. Sliders come
// in DOMAIN_ORDER (alphabetical by key). The form sits inside the Today tab
// with no SafeAreaView of its own, so its 40pt top padding is from the very top
// of the screen -- reproduced, not corrected.
const ANCHORS = { // SLIDER_LABELS, src/lib/domains.ts
  anxiety: ['Calm', 'Extremely tense'],
  energy: ['Completely drained', 'Fully energised'],
  mood: ['Very low spirits', 'Very high spirits'],
  sensory_sensitivity: ['Not bothered', 'Overwhelmed'],
};
// Three domains, not four, so Done clears the tab bar instead of hiding
// under it -- someone tracking three is the ordinary case.
const CHECKIN = [
  { key: 'anxiety', label: 'Anxiety', value: 7, baseline: 6 },
  { key: 'mood', label: 'Mood', value: 6, baseline: 5 },
  { key: 'sensory_sensitivity', label: 'Sensory overwhelm', value: 8, baseline: 6 },
];

// The native form has no SafeAreaView (app/index.tsx returns it bare), so on a
// device its 40pt top padding puts the card under the status bar. That is an
// app bug, not a look to sell: the screenshot places the form below the
// status bar, as it will sit once the app wraps it.
screens.checkIn = {
  top: SAFE_TOP, tab: 'today', bg: GROUND,
  body: `        <div style="padding: 20px 20px 0;">
          <div style="background: #1e2840; border: 1px solid #3d4f7a; border-radius: 20px; padding: 28px 24px 24px; margin-bottom: 16px;">
            <p style="font-size: 13px; color: ${ACCENT}; font-weight: 500; text-transform: uppercase; letter-spacing: 0.6px; margin: 0 0 24px;">Now · Mind check-in</p>
            <div style="display: flex; flex-direction: column; gap: 28px;">
${CHECKIN.map((d) => slider({ ...d, color: DOMAIN[d.key], low: ANCHORS[d.key][0], high: ANCHORS[d.key][1] })).join('\n')}
            </div>
          </div>

          <div style="background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 20px; margin-bottom: 16px;">
            <p style="font-size: 13px; color: #718096; margin: 0 0 10px;">Context</p>
            <p style="margin: 0; color: ${TEXT}; font-size: 13px; line-height: 18px; min-height: 60px;">Loud office all morning, skipped lunch</p>
            <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
              <span style="font-size: 11px; color: #4a5568;">38 / 200</span>
            </div>
          </div>

          <div style="padding: 14px; border-radius: 12px; background: ${FILL}; text-align: center;">
            <span style="color: ${ON_FILL}; font-size: 15px; font-weight: 600;">Done</span>
          </div>
        </div>`,
};

// === Domain selection =======================================================
// src/components/onboarding/domain-selection-step.tsx + onboarding-controls.tsx.
// No longer an onboarding step: it opens full-screen from the "What do you want
// to track?" setup card on Today (today/setup-cards.tsx). Copy from
// lib/domains.ts DOMAIN_COPY, in DOMAIN_ORDER.
const domainRow = (label, desc, selected) => `<div style="padding: 14px; border-radius: 12px; border: 1px solid ${selected ? tint(FILL_ALT, 0.5) : BORDER}; background: ${selected ? tint(FILL_ALT, 0.1) : CARD}; display: flex; align-items: flex-start; gap: 12px;">
              <div style="width: 20px; height: 20px; box-sizing: border-box; border-radius: 4px; border: 1px solid ${selected ? ACCENT : '#2d3748'}; background: ${selected ? FILL : 'transparent'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;">
                ${selected ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3.5" stroke="${CHECKBOX_TICK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>` : ''}
              </div>
              <div style="flex: 1;">
                <p style="font-size: 15px; font-weight: 500; color: ${TEXT}; margin: 0 0 3px;">${label}</p>
                <p style="font-size: 13px; color: #64748b; line-height: 19px; margin: 0;">${desc}</p>
              </div>
            </div>`;

boards['Domains.dc.html'] = artboard({ accent: MIND.irritability,
  lines: ['Only the domains', 'that matter to you'],
  app: {
    top: SAFE_TOP, tab: null, bg: '#0f1117',
    body: `        <div style="padding: 40px 24px 0;">
          <h2 style="font-size: 24px; font-weight: 300; color: ${TEXT}; margin: 0 0 16px;">What do you want to track?</h2>
          <p style="color: #94a3b8; line-height: 24px; font-size: 15px; margin: 0 0 8px;">Choose the symptoms and experiences you want to pay attention to - as few as 2, as many as all 8. This is the only time you’ll need to do this: every check-in after today only shows what you pick right now, so there’s nothing to scroll past and nothing to hide later.</p>
          <p style="color: #64748b; line-height: 22px; font-size: 14px; margin: 0 0 28px;">Not sure where to start? Mood, energy, and anxiety are commonly tracked together. You can always add more domains later from Settings.</p>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px;">
${domainRow('Anxiety', 'Tension, worry, or unease.', true)}
${domainRow('Concentration', 'How easy it is to focus.', false)}
${domainRow('Energy', 'How much fuel you feel you have.', true)}
${domainRow('Irritability', 'How on-edge or reactive you feel.', false)}
${domainRow('Mood', 'Your overall emotional tone right now.', true)}
${domainRow('Motivation', 'Drive and desire to do things.', false)}
${domainRow('Sensory overwhelm', 'How much sensory input is affecting you.', true)}
          </div>
        </div>`,
  },
});

// === Comfort mode ===========================================================
// The due-now screen (src/app/index.tsx, active branch) with a comfort window
// armed from Today: ComfortBanner, the quiet accent set, x1.15 type on the
// hero card (fs()), no countdown, and the "Nothing unusual today" one-tap --
// today/check-in-cards.tsx ActiveCheckInCard + today/comfort-controls.tsx.
// The banner and header are not scaled; only the card's styles use fs().
screens.comfort = {
  top: SAFE_TOP, tab: 'today', bg: GROUND,
  body: `        <div style="padding: 20px 24px 0; height: ${APP_H - SAFE_TOP - TAB_H}px; box-sizing: border-box; display: flex; flex-direction: column;">
          ${todayHeader('mk-comfort', true)}

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #0d1014; border: 1px solid #1b2029; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px;">
            <div>
              <p style="font-size: 15px; font-weight: 500; color: #97a1b4; margin: 0;">Comfort mode</p>
              <p style="font-size: 13px; color: #7886a0; margin: 2px 0 0;">Until 4:30 pm · reminders paused</p>
            </div>
            <span style="font-size: 14px; font-weight: 500; color: #8b94a8;">Turn off</span>
          </div>

          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding-bottom: 40px;">
            <div style="background: ${SURFACE}; border: 1px solid ${QUIET.border}; border-radius: 24px; padding: 32px 28px 28px; display: flex; flex-direction: column; gap: 28px;">
              <div>
                <p style="font-size: ${cfs(12)}px; color: ${QUIET.text}; letter-spacing: 1.4px; font-weight: 700; margin: 0 0 12px;">MIND CHECK-IN AVAILABLE</p>
                <p style="font-size: ${cfs(22)}px; color: ${TEXT}; font-weight: 600; letter-spacing: -0.4px; margin: 0 0 6px;">Mind check-in</p>
                <p style="font-size: ${cfs(15)}px; color: #7886a0; margin: 0;">Open whenever you are ready</p>
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="padding: 18px; border-radius: 14px; background: ${QUIET.fill}; text-align: center;">
                  <span style="font-size: ${cfs(17)}px; font-weight: 700; color: ${QUIET.onFill}; letter-spacing: -0.2px;">Log now</span>
                </div>
                <div style="padding: 14px; border-radius: 14px; border: 1px solid ${QUIET.border}; text-align: center;">
                  <span style="font-size: ${cfs(15)}px; font-weight: 600; color: #cbd5e0;">Nothing unusual today</span>
                </div>
                <div style="padding: 8px; text-align: center;">
                  <span style="font-size: ${cfs(14)}px; font-weight: 500; color: #7886a0;">Snooze 5 min</span>
                </div>
              </div>
            </div>
          </div>
        </div>`,
};
boards['Comfort.dc.html'] = artboard({ accent: MIND.mood,
  lines: ['Comfort mode, for days', 'when a screen is too much'],
  app: screens.comfort,
});

// === Body tracking is an add-on =============================================
// src/app/settings.tsx (DomainPills, BodyDomainPills, the first two sections),
// settings/settings-primitives.tsx, settings/settings-icons.tsx. Native Switch:
// track = accent fillAlt, thumb white.
const SECTION_LABEL = (t) => `<p style="font-size: 11px; font-weight: 600; color: #555c72; letter-spacing: 0.9px; padding: 20px 4px 8px; margin: 0;">${t}</p>`;
const sectionCard = (rows) => `<div style="background: #181c26; border: 1px solid #252b3b; border-radius: 14px; overflow: hidden; margin-bottom: 10px;">
${rows.join('\n')}
          </div>`;
const divider = `            <div style="height: 1px; background: #252b3b; margin: 0 16px;"></div>`;
const IC = `width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${FLAT}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICONS = {
  brain: `<svg ${IC}><path d="M6 3a2.2 2.2 0 0 0-2.2 2.2c0 .3.05.55.13.8A2 2 0 0 0 3 8c0 .7.35 1.3.9 1.7-.1.25-.15.5-.15.8A2 2 0 0 0 6 12.5"></path><path d="M10 3a2.2 2.2 0 0 1 2.2 2.2c0 .3-.05.55-.13.8A2 2 0 0 1 13 8c0 .7-.35 1.3-.9 1.7.1.25.15.5.15.8A2 2 0 0 1 10 12.5"></path><path d="M8 3v9.5"></path><path d="M6 5.5c.6.4 1.4.4 2 0M6 8c.6.4 1.4.4 2 0M6 10.3c.6.4 1.4.4 2 0"></path></svg>`,
  clock: `<svg ${IC}><circle cx="8" cy="8" r="6"></circle><polyline points="8 5 8 8 10.5 9.5"></polyline></svg>`,
  clockSimple: `<svg ${IC}><circle cx="8" cy="8" r="5.5"></circle><polyline points="8 5 8 8 10.5 9.5"></polyline></svg>`,
  body: `<svg ${IC}><circle cx="8" cy="3" r="1.8"></circle><path d="M8 6.5v4M8 6.5l-3 1.5M8 6.5l3 1.5M8 10.5l-2.5 3M8 10.5l2.5 3"></path></svg>`,
  bell: `<svg ${IC}><path d="M8 2a4 4 0 0 1 4 4v3l1 1.5H3L4 9V6a4 4 0 0 1 4-4z"></path><path d="M6.5 12.5a1.5 1.5 0 0 0 3 0"></path></svg>`,
};
const settingsChevron = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink: 0;"><path d="M5 2l5 5-5 5" stroke="#555c72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const rowValue = (t) => `<span style="font-size: 14px; color: #8b90a4;">${t}</span>${settingsChevron}`;
const toggle = (on) => `<div style="width: 51px; height: 31px; border-radius: 16px; background: ${on ? FILL_ALT : '#252b3b'}; position: relative; flex-shrink: 0;"><div style="position: absolute; top: 2px; left: ${on ? 22 : 2}px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16);"></div></div>`;
const settingsRow = (icon, label, subtitle, right = '') => `            <div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px;">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: ${tint(FLAT, 0.15)}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${icon}</div>
              <div style="flex: 1; min-width: 0;">
                <p style="font-size: 15px; font-weight: 500; color: #e2e4ec; margin: 0;">${label}</p>
                ${subtitle ? `<p style="font-size: 12px; color: #8b90a4; margin: 2px 0 0; line-height: 17px;">${subtitle}</p>` : ''}
              </div>
              ${right ? `<div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">${right}</div>` : ''}
            </div>`;
// Mind pills are accent-tinted when on (not per-domain colours); body pills
// wear BODY_COLOR.
const pills = (items, kind) => `            <div style="display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 14px;">
              ${items.map(([label, on]) => {
                const style = !on
                  ? 'background: #1e2333; border: 1px solid #252b3b; color: #555c72;'
                  : kind === 'body'
                    ? `background: ${tint(BODY_COLOR, 0.15)}; border: 1px solid ${tint(BODY_COLOR, 0.4)}; color: ${BODY_COLOR};`
                    : `background: ${tint(FLAT, 0.15)}; border: 1px solid ${tint(FLAT, 0.4)}; color: ${SOFT};`;
                return `<span style="font-size: 12px; font-weight: 500; padding: 5px 11px; border-radius: 8px; ${style}">${label}</span>`;
              }).join('\n              ')}
            </div>`;

screens.settings = {
    top: SAFE_TOP, tab: 'settings', bg: '#0f1117',
    body: `        <div style="padding: 20px 16px 0;">
          ${logoHeader('mk-settings')}
          <h1 style="font-size: 22px; font-weight: 600; color: #e2e4ec; letter-spacing: -0.3px; margin: 0 0 4px;">Settings</h1>

          ${SECTION_LABEL('YOUR TRACKING SETUP')}
          ${sectionCard([
            settingsRow(ICONS.brain, 'Mind Tracking', '4 of 8 active'),
            pills([['Mood', true], ['Energy', true], ['Anxiety', true], ['Concentration', false], ['Irritability', false], ['Social depletion', false], ['Sensory overwhelm', true], ['Motivation', false]], 'mind'),
            divider,
            settingsRow(ICONS.clock, 'Active window', '8:00am - 9:00pm', rowValue('Edit')),
            divider,
            settingsRow(ICONS.clockSimple, 'Mind check-ins per day', '', rowValue('3')),
          ])}

          ${SECTION_LABEL('BODY TRACKING')}
          ${sectionCard([
            settingsRow(ICONS.body, 'Body tracking', 'Fatigue, pain, and other physical symptoms', toggle(true)),
            divider,
            pills([['Fatigue across the day', true], ['Joint &amp; muscle pain', true], ['Widespread pain', true], ['Joint instability', true], ['Breathing', false], ['Dizziness', true], ['Gut', false], ['Brain fog', true]], 'body'),
            divider,
            settingsRow(ICONS.clock, 'Available from', '6:00pm', rowValue('Edit')),
            divider,
            settingsRow(ICONS.clockSimple, 'Remind me at', '8:00pm', rowValue('Edit')),
            divider,
            settingsRow(ICONS.bell, 'Morning check-in', 'Optional: fatigue, pain, and dizziness, before the day starts', toggle(true)),
          ])}
        </div>`,
};
boards['BodyAddOn.dc.html'] = artboard({ accent: MIND.energy,
  lines: ['Body tracking is optional.', 'Switch it on if you need it'],
  app: screens.settings,
});
// Slot 4: mind and body choices side by side, in place of the Domains picker.
boards['Tracking.dc.html'] = artboard({ accent: MIND.irritability,
  lines: ['Mind, body, or both.', 'Only what matters to you.'],
  app: screens.settings,
});

// === History ================================================================
// src/app/history.tsx + history/day-card.tsx, mind-section.tsx, body-section.tsx,
// sparkline.tsx, marker-icons.tsx. Summaries are written in summariseDay()'s
// own sentence shapes (src/lib/summarise-day.ts). The mind rows use
// DOMAIN_NAMES, which still says "Sensory sensitivity" -- as the app does.
const CHIP_ICON = {
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path>',
  note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"></path><path d="M14 3v5h5"></path><path d="M9 13h6M9 17h4"></path>',
};
const chip = (icon, label) => `<span style="display: inline-flex; align-items: center; gap: 4px; border: 1px solid ${BORDER}; border-radius: 8px; padding: 4px 9px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8892a4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CHIP_ICON[icon]}</svg><span style="font-size: 11px; color: #8892a4;">${label}</span></span>`;
const expandRow = (open) => `<div style="display: flex; align-items: center; gap: 4px; margin-top: 12px; padding: 4px 0;">
                <span style="font-size: 13px; color: ${ACCENT};">${open ? 'Hide the day' : 'Show the day'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${open ? 180 : 0}deg);"><path d="M6 9l6 6 6-6"></path></svg>
              </div>`;
function dayCard({ day, date, count, summary, chips = [], expandable = false, open = false, detail = '' }) {
  return `<div style="background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 16px; overflow: hidden;">
            <div style="padding: 16px 20px;">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2px;">
                <p style="font-size: 15px; font-weight: 500; color: #c8d0e0; margin: 0;">${day}</p>
                <span style="font-size: 12px; color: #4a5568;">${count} check-in${count === 1 ? '' : 's'}</span>
              </div>
              <p style="font-size: 12px; color: #8892a4; margin: 0 0 10px;">${date}</p>
              <p style="font-size: 14px; color: #b0b8c8; line-height: 21.7px; margin: 0;">${summary}</p>
              ${chips.length ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">${chips.join('')}</div>` : ''}
              ${expandable ? expandRow(open) : ''}
            </div>
            ${open ? `<div style="border-top: 1px solid ${BORDER}; padding: 16px 20px 20px;">${detail}</div>` : ''}
          </div>`;
}
function sparkline(values, color) {
  const w = 96, h = 24, pad = 3, uh = h - pad * 2;
  const pts = values.map((v, i) => ((i / (values.length - 1)) * w).toFixed(1) + ',' + (pad + uh * (1 - v / 10)).toFixed(1)).join(' ');
  return `<svg width="96" height="24" viewBox="0 0 96 24" style="flex-shrink: 0;"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>`;
}
const mindRow = (label, values, color) => {
  const min = Math.min(...values), max = Math.max(...values);
  return `<div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 12px; color: #b0b8c8; width: 82px; flex-shrink: 0;">${label}</span>
                    ${sparkline(values, color)}
                    <span style="font-size: 12px; color: #8892a4; margin-left: auto; flex-shrink: 0; ${NUM}">${min === max ? min : `${min} to ${max}`}</span>
                  </div>`;
};
const bodyRow = (label, am, pm) => `<div style="display: flex; align-items: center;">
                    <span style="flex: 1; font-size: 12px; color: #b0b8c8; padding: 5px 0;">${label}</span>
                    <span style="width: 44px; text-align: right; font-size: 12px; color: #8892a4; padding: 5px 0; ${NUM}">${am}</span>
                    <span style="width: 44px; text-align: right; font-size: 12px; color: #8892a4; padding: 5px 0; ${NUM}">${pm}</span>
                  </div>`;
const bodyHead = `<div style="display: flex; align-items: center;"><span style="flex: 1;"></span>${['am', 'pm'].map((t) => `<span style="width: 44px; text-align: right; font-size: 10px; font-weight: 600; color: #4a5568; text-transform: uppercase; padding: 5px 0;">${t}</span>`).join('')}</div>`;

const YESTERDAY = {
  day: 'Yesterday', date: 'Wednesday 21 October 2026', count: 3,
  summary: 'Up and down. Sensory sensitivity picked up in the morning, and body symptoms built into the evening.',
  chips: [chip('moon', 'Poor · 5.5h'), chip('note', 'Note')],
  expandable: true,
};

screens.bodyTogether = {
  top: SAFE_TOP, tab: 'history', bg: GROUND,
  body: `        <div style="padding: 20px 20px 0;">
          ${logoHeader('mk-bodytog')}
          <h1 style="font-size: 32px; font-weight: 500; color: ${TEXT}; letter-spacing: -0.6px; margin: 0 0 12px;">History</h1>
          <div style="display: flex; flex-direction: column; gap: 8px;">
          ${dayCard({ ...YESTERDAY, open: true, detail: `
              <div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px;">
                  <span style="font-size: 11px; color: ${ACCENT}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.9px;">Mind</span>
                  <span style="font-size: 11px; color: #4a5568;">09:12 am to 08:40 pm</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${mindRow('Mood', [5, 4, 6], DOMAIN.mood)}
                  ${mindRow('Energy', [4, 2, 3], DOMAIN.energy)}
                  ${mindRow('Anxiety', [5, 7, 6], DOMAIN.anxiety)}
                  ${mindRow('Sensory sensitivity', [6, 8, 8], DOMAIN.sensory_sensitivity)}
                </div>
              </div>
              <div style="margin-top: 20px;">
                <p style="font-size: 11px; font-weight: 600; color: ${BODY_COLOR}; text-transform: uppercase; letter-spacing: 0.9px; margin: 0 0 10px;">Body</p>
                ${bodyHead}
                ${bodyRow('Fatigue across the day', 7, 8)}
                ${bodyRow('Joint &amp; muscle pain', 5, 6)}
                ${bodyRow('Joint instability', '-', 5)}
                ${bodyRow('Dizziness', 6, 7)}
                ${bodyRow('Brain fog', '-', 7)}
                ${bodyRow('End of day exhaustion', '-', 8)}
                <p style="font-size: 12px; color: #6b7a99; line-height: 18px; margin: 8px 0 0;">Pain/Instability: Neck, left knee · woke up dizzy, didn't settle</p>
              </div>` })}
          </div>
        </div>`,
};
boards['BodyTogether.dc.html'] = artboard({ lines: ['Built for bodies', "that don't fit one label"], app: screens.bodyTogether, accent: MIND.social });

screens.history = {
  top: SAFE_TOP, tab: 'history', bg: GROUND,
  body: `        <div style="padding: 20px 20px 0;">
          ${logoHeader('mk-hist')}
          <h1 style="font-size: 32px; font-weight: 500; color: ${TEXT}; letter-spacing: -0.6px; margin: 0 0 12px;">History</h1>
          <div style="display: flex; flex-direction: column; gap: 8px;">
          ${dayCard({ day: 'Today', date: 'Thursday 22 October 2026', count: 2, summary: 'Some movement today. Energy dropped away in the morning.', chips: [chip('moon', 'Well · 7.5h')], expandable: true })}
          ${dayCard(YESTERDAY)}
          ${dayCard({ day: 'Tue 20 Oct', date: 'Tuesday 20 October 2026', count: 0, summary: 'No check-ins.' })}
          ${dayCard({ day: 'Mon 19 Oct', date: 'Monday 19 October 2026', count: 0, summary: 'No check-ins.' })}
          ${dayCard({ day: 'Sun 18 Oct', date: 'Sunday 18 October 2026', count: 1, summary: 'One check-in, in the evening. Not enough to describe the day.', chips: [chip('pill', 'Physio session')] })}
          </div>
        </div>`,
};

// === Insights ===============================================================
// src/app/insights.tsx (RangeControl, WhatStandsOut, AreaIndex, the Patterns
// toggle), lib/area-rows.ts for the row wording, and lib/pattern-findings.ts
// for the sentence templates -- day-of-week, lag, body x mind connection.
const areaRow = (label, subtitle) => `<div style="background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 12px;">
              <span style="width: 10px; height: 10px; border-radius: 5px; background: ${ACCENT}; flex-shrink: 0;"></span>
              <div style="flex: 1;">
                <p style="font-size: 14px; font-weight: 500; color: ${TEXT}; margin: 0 0 2px;">${label}</p>
                <p style="font-size: 12px; color: #8892a4; margin: 0;">${subtitle}</p>
              </div>
              ${chevronRight()}
            </div>`;
const sectionHead = (t) => `<p style="font-size: 11px; color: #8892a4; font-weight: 600; text-transform: uppercase; letter-spacing: 1.1px; margin: 0 0 12px;">${t}</p>`;

screens.insights = {
  top: SAFE_TOP, tab: 'insights', bg: GROUND,
  body: `        <div style="padding: 20px 20px 0;">
          ${logoHeader('mk-ins')}
          <h1 style="font-size: 26px; font-weight: 600; color: ${TEXT}; letter-spacing: -0.6px; margin: 0 0 20px;">Insights</h1>

          <div style="margin-bottom: 24px;">
            <div style="display: inline-flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 10px; background: ${CARD}; border: 1px solid ${BORDER};">
              <span style="font-size: 14px; font-weight: 500; color: ${TEXT};">Last 30 days</span>
              ${chevronDown()}
            </div>
            <p style="font-size: 12px; color: #6b7a99; margin: 10px 0 0;">23 Sept to 22 Oct · 71 check-ins · 27 days with a check-in</p>
          </div>

          <div style="margin-bottom: 24px;">
            ${sectionHead('What stands out')}
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <p style="font-size: 15px; color: ${TEXT}; line-height: 23px; margin: 0;">${hl('Sensory overwhelm', DOMAIN.sensory_sensitivity)} runs 2.1 points higher on Wednesdays, holding true in 4 of 4 weeks.</p>
              <p style="font-size: 15px; color: ${TEXT}; line-height: 23px; margin: 0;">When ${hl('Joint instability', BODY_COLOR)} shifts, ${hl('Energy', DOMAIN.energy)} tends to follow two days later, holding true in 14 of 18 instances.</p>
              <p style="font-size: 15px; color: ${TEXT}; line-height: 23px; margin: 0;">Your ${hl('Dizziness', BODY_COLOR)} and ${hl('Anxiety', DOMAIN.anxiety)} tend to move together.</p>
            </div>
          </div>

          <div style="margin-bottom: 24px;">
            ${sectionHead('The evidence')}
            <div style="display: flex; flex-direction: column; gap: 8px;">
${areaRow('Mind', '3 patterns · 1 domain steady')}
${areaRow('Body', '2 symptoms rising')}
${areaRow('Sleep', 'Affects 2 areas')}
${areaRow('Events', '2 effects observed')}
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between;">
            ${sectionHead('Patterns')}
            <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 12px;">
              <span style="font-size: 12px; color: #6b7a99;">3</span>
              <span style="font-size: 14px; color: #6b7a99; line-height: 16px;">⌄</span>
            </div>
          </div>
        </div>`,
};

// === Events (was Medication) ================================================
// src/components/insights/medication-area-detail.tsx + back-row.tsx, and
// interventionImpactFindings() in lib/pattern-findings.ts for the wording.
const impactCard = (label, date, sentence, evidence) => `<div style="background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 12px; padding: 14px 16px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 12px; color: ${SOFT}; font-weight: 600;">${label}</span>
                <span style="font-size: 11px; color: #4a5568;">${date}</span>
              </div>
              <p style="font-size: 13px; color: #c8d0e0; line-height: 19px; margin: 0 0 4px;">${sentence}</p>
              <p style="font-size: 11px; color: #4a5568; margin: 0;">${evidence}</p>
            </div>`;

screens.markers = {
    top: SAFE_TOP, tab: 'insights', bg: GROUND,
    body: `        <div style="padding: 20px; display: flex; flex-direction: column; gap: 24px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="padding: 4px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8892a4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><polyline points="15 18 9 12 15 6"></polyline></svg></div>
            <span style="font-size: 20px; font-weight: 600; color: ${TEXT}; letter-spacing: -0.4px;">Events</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
${impactCard('Sertraline 100mg', '4 Sept', `${hl('Brain fog', BODY_COLOR)} increased by 1.4 points in the 28 days after Sertraline 100mg.`, '28 days before · 28 days after')}
${impactCard('Physio started', '15 Sept', `${hl('Anxiety', DOMAIN.anxiety)} decreased by 1.2 points in the 28 days after Physio started.`, '21 days before · 28 days after')}
          </div>

          <div>
            <p style="font-size: 11px; color: #8892a4; text-transform: uppercase; letter-spacing: 1.1px; font-weight: 600; margin: 0 0 10px;">Too early to read</p>
            <p style="font-size: 13px; color: #6b7a99; line-height: 19px; margin: 0;">LDN 1.5mg, 14 Oct: too early to read</p>
          </div>

          <p style="font-size: 12px; color: #4a5568; line-height: 18px; margin: 0;">These are observations from your data, not clinical conclusions. Patterns in the period after a marker don’t imply causation.</p>
        </div>`,
};
boards['Markers.dc.html'] = artboard({ accent: MIND.motivation,
  lines: ['See whether a change', 'actually moved anything'],
  app: screens.markers,
});

// === Prepare / report =======================================================
// src/app/prepare.tsx, prepare/appointment-context.tsx, date-range-control.tsx,
// questions-section.tsx + question-card.tsx, generate-report-section.tsx.
// Scrolled so the report card -- the point of the caption -- is in full view.
const PREP_LABEL = (t, mb = 12) => `<p style="font-size: 11px; font-weight: 600; color: #4a5568; text-transform: uppercase; letter-spacing: 0.9px; margin: 0 0 ${mb}px;">${t}</p>`;
const prepCard = (inner, pad = '20px') => `<div style="background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 16px; padding: ${pad}; margin-bottom: 16px;">${inner}</div>`;
const star = (filled) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="${filled ? ACCENT : 'none'}" stroke="${filled ? ACCENT : '#4a5568'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
const qIcons = `<div style="display: flex; gap: 6px;">
                  <span style="padding: 2px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5568" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></span>
                  <span style="padding: 2px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5568" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4h6v2"></path></svg></span>
                </div>`;
const question = (text, priority) => `<div style="padding: 12px 0; border-bottom: 1px solid ${BORDER};">
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                  <span style="color: #2d3748; font-size: 16px; line-height: 20px;">⠿</span>
                  <span style="width: 18px; height: 18px; box-sizing: border-box; border-radius: 4px; border: 1.5px solid #2d3748; margin-top: 3px; flex-shrink: 0;"></span>
                  <p style="flex: 1; font-size: 14px; color: #c8d0e0; line-height: 20px; margin: 0;">${text}</p>
                  ${qIcons}
                </div>
                <div style="padding-left: 28px; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
                  ${star(priority)}<span style="font-size: 12px; color: ${priority ? ACCENT : '#4a5568'};">${priority ? 'Priority' : 'Make priority'}</span>
                </div>
              </div>`;
const include = (label) => `<div style="display: flex; align-items: center; gap: 12px;">
                <span style="width: 22px; height: 22px; box-sizing: border-box; border-radius: 6px; background: ${FILL}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><span style="font-size: 13px; color: ${ON_FILL}; font-weight: 700;">✓</span></span>
                <span style="font-size: 15px; color: ${TEXT};">${label}</span>
              </div>`;
const rangePill = (t, on) => `<span style="padding: 6px 14px; border-radius: 8px; ${on ? `background: ${FILL}; color: ${ON_FILL};` : 'border: 1px solid #2d3748; color: #8892a4;'} font-size: 13px; font-weight: 500;">${t}</span>`;

screens.report = {
  top: SAFE_TOP, tab: 'prepare', bg: GROUND, scroll: 520,
  body: `        <div style="padding: 20px 20px 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h1 style="font-size: 26px; font-weight: 600; color: ${TEXT}; letter-spacing: -0.6px; margin: 0;">Prepare</h1>
            <span style="font-size: 18px; color: #4a5568;">ⓘ</span>
          </div>

          ${prepCard(`${PREP_LABEL('Appointment')}
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <p style="font-size: 16px; font-weight: 500; color: ${TEXT}; margin: 0 0 4px;">Tuesday 3 November 2026</p>
                <p style="font-size: 13px; color: #8892a4; margin: 0;">In 12 days</p>
              </div>
              <span style="color: ${ACCENT}; font-size: 13px; font-weight: 500;">Edit</span>
            </div>
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid ${BORDER};">
              <p style="font-size: 11px; color: #4a5568; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; margin: 0 0 6px;">Focus areas</p>
              <p style="font-size: 13px; color: #8892a4; margin: 0;">Fatigue, dizziness on standing, the Wednesday pattern</p>
            </div>
            <p style="color: #2d3748; font-size: 12px; margin: 14px 0 0;">Remove appointment</p>`)}

          ${prepCard(`${PREP_LABEL('Date range')}
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;">
              ${rangePill('14 days', false)}${rangePill('30 days', true)}${rangePill('60 days', false)}${rangePill('90 days', false)}${rangePill('Since Physio started', false)}${rangePill('Custom', false)}
            </div>
            <p style="font-size: 12px; color: #4a5568; margin: 0;">22 Sept 2026 to 22 Oct 2026 · 4 weeks</p>`, '18px 20px')}

          ${prepCard(`<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              ${PREP_LABEL('Questions', 0)}
              <span style="font-size: 12px; color: #6b7a99;">2 questions</span>
            </div>
            <p style="font-size: 11px; font-weight: 600; color: ${ACCENT}; text-transform: uppercase; letter-spacing: 0.6px; margin: 8px 0 0;">Priority</p>
            ${question('Is the Wednesday pattern in my sensory symptoms worth looking into?', true)}
            <p style="font-size: 11px; font-weight: 600; color: #4a5568; text-transform: uppercase; letter-spacing: 0.6px; margin: 12px 0 0;">Other</p>
            ${question('Could the brain fog since starting sertraline be a side effect?', false)}
            <p style="font-size: 13px; font-weight: 500; color: ${ACCENT}; margin: 12px 0 0;">+ Add question</p>`)}

          ${prepCard(`${PREP_LABEL('Generate report')}
            <p style="font-size: 12px; color: #4a5568; margin: 0 0 16px;">22 Sept 2026 - 22 Oct 2026</p>
            <p style="font-size: 14px; color: ${TEXT}; margin: 0 0 8px;">What should the report call you?</p>
            <div style="background: ${GROUND}; border: 1px solid #2d3748; border-radius: 10px; padding: 12px 14px; font-size: 15px; color: ${TEXT};">Aisha</div>
            <p style="font-size: 12px; color: #4a5568; line-height: 18px; margin: 8px 0 16px;">First name or a nickname - whatever you'd want a clinician to call you. Symetric doesn't need your full name.</p>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
              ${include('Include mind check-ins')}
              ${include('Include body check-ins')}
              ${include('Include cycle dates')}
            </div>
            <p style="font-size: 13px; color: #6b7a99; margin: 0 0 16px;">2 patterns selected for this report</p>
            <div style="padding: 13px; background: ${FILL}; border-radius: 10px; text-align: center;">
              <span style="font-size: 15px; font-weight: 600; color: ${ON_FILL};">Generate PDF</span>
            </div>`)}
        </div>`,
};

// === Captions =============================================================
// The five narrative captions are reproduced verbatim from
// store/play-store-copy.md (19 Aug 2026). Line breaks are
// a layout choice; the words are untouched. The recommended set reuses four of
// them as-is and changes one: "thirty seconds" -> "twenty seconds", to match
// the in-product copy and .agents/product-marketing.md.
const CAP = {
  hook: ['Fifteen minutes to describe', 'the last three months?', 'Nobody can do that.'],
  answer30: ['So answer it', 'thirty seconds at a time.'],
  answer20: ['So answer it', 'twenty seconds at a time.'],
  miss: ['Miss one. Miss a week.', 'Nothing breaks.'],
  week6: ['By about week six,', 'it has something to say.'],
  pdf: ['A PDF to hand', 'across the desk.'],
};

// -- Recommended set: the narrative spine, with the feature cards that earn
//    their place between its beats.
// Each card's mind colour (2b): hero energy, then anxiety, concentration,
// irritability, social, sensory, mood, motivation, anxiety (the site's report
// colour), and motivation to close -- purple never on the first two.
boards['Hook.dc.html'] = artboard({ lines: CAP.hook, app: screens.today, accent: MIND.anxiety });
boards['CheckIn.dc.html'] = artboard({ lines: CAP.answer20, app: screens.checkIn, accent: MIND.concentration });
boards['History.dc.html'] = artboard({ lines: CAP.miss, app: screens.history, accent: MIND.sensory });
boards['Insights.dc.html'] = artboard({ lines: CAP.week6, app: screens.insights, accent: MIND.mood });
boards['Report.dc.html'] = artboard({ lines: CAP.pdf, app: screens.report, accent: MIND.anxiety });

// -- Narrative set: the five captions and nothing else, in the doc's order.
boards['N1Hook.dc.html'] = artboard({ lines: CAP.hook, app: screens.today, accent: MIND.anxiety });
boards['N2Answer.dc.html'] = artboard({ lines: CAP.answer30, app: screens.checkIn, accent: MIND.concentration });
boards['N3Miss.dc.html'] = artboard({ lines: CAP.miss, app: screens.history, accent: MIND.sensory });
boards['N4Week6.dc.html'] = artboard({ lines: CAP.week6, app: screens.insights, accent: MIND.mood });
boards['N5Pdf.dc.html'] = artboard({ lines: CAP.pdf, app: screens.report, accent: MIND.anxiety });

// === Hero ===================================================================
// The first card in search results, so it carries the whole pitch: what you
// do, what comes out, and the pricing line. The phone is the History screen
// above, tilted; the two cards breaking out of it are the app's own Insights
// card (sentence verbatim from screens.insights) and the Prepare tab's PDF.
// It is the only tilted phone in the set -- every later card stays upright.
// Copy is the homepage's: its h1, and two of its trust claims for the pills.
// The ribbon is off-white, 2b's base accent; the mind colours stay small (the
// card's label, the pill icons).
const heroPill = (icon, color, text) => `<div style="flex: 1; height: 168px; box-sizing: border-box; border-radius: 84px; background: ${SLATE_TILE}; display: flex; align-items: center; gap: 28px; padding: 0 48px;">
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">${icon}</svg>
      <span style="font-family: ${DISPLAY}; font-size: 42px; line-height: 1.12; font-weight: 600; color: ${TEXT};">${text}</span>
    </div>`;
const DOC_ICON = '<path d="M6 3h8l4 4v14H6z"></path><path d="M9 13h6M9 17h6"></path>';

boards['Main.dc.html'] = dcPage(`<div style="width: 1290px; height: 2796px; box-sizing: border-box; background: ${GROUND}; position: relative; overflow: hidden; font-family: ${FONT};">

  <svg width="1290" height="2796" viewBox="0 0 1290 2796" style="position: absolute; inset: 0;"><path d="M-60 1080 C 220 700, 440 1420, 700 1220 S 1160 860, 1360 1420" fill="none" stroke="${FILL}" stroke-width="52" stroke-linecap="round"></path></svg>

  <div style="position: absolute; left: 96px; right: 96px; top: 140px; display: flex; flex-direction: column; align-items: center; gap: 44px;">
    <div style="display: flex; align-items: center; gap: 20px;">
      ${logo('mk-hero', 76, SLATE_TILE)}
      <span style="font-family: ${DISPLAY}; font-size: 58px; font-weight: 700; color: ${TEXT}; letter-spacing: -0.02em;">symetric</span>
    </div>
    <h1 style="margin: 0; font-family: ${DISPLAY}; font-size: 96px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: ${TEXT}; text-align: center;"><span style="color: ${SITE.mute};">Walk in with the last<br>three months,</span> not the<br>last three days.</h1>
  </div>

  ${device(screens.history, 'position: absolute; left: 136px; top: 720px; transform: rotate(-6deg) scale(0.72); transform-origin: 50% 0;')}

  <div style="position: absolute; left: 48px; top: 1500px; width: 560px; box-sizing: border-box; transform: rotate(-6deg); background: ${SITE.card}; border: 2px solid ${SITE.rule}; border-radius: 40px; padding: 40px 44px; box-shadow: 0 40px 100px rgba(0,0,0,0.65); display: flex; flex-direction: column; gap: 16px;">
    <span style="font-family: ${DISPLAY}; font-size: 26px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${MIND.energy};">What moves with what</span>
    <span style="font-size: 40px; line-height: 1.3; color: ${TEXT};">Your ${hl('Dizziness', BODY_COLOR)} and ${hl('Anxiety', DOMAIN.anxiety)} tend to move together.</span>
  </div>

  <div style="position: absolute; right: 40px; top: 1980px; width: 560px; box-sizing: border-box; transform: rotate(4deg); background: ${FILL}; border-radius: 40px; padding: 40px 44px; box-shadow: 0 40px 100px rgba(0,0,0,0.65); display: flex; align-items: center; gap: 28px;">
    <svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="${ON_FILL}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">${DOC_ICON}</svg>
    <span style="font-family: ${DISPLAY}; font-size: 42px; line-height: 1.15; font-weight: 700; color: ${ON_FILL};">A report your clinician can read</span>
  </div>

  <div style="position: absolute; left: 96px; right: 96px; top: 2470px; display: flex; gap: 36px;">
    ${heroPill('<rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M3 10h18"></path>', MIND.concentration, 'AU$9.99 once,<br>no subscription')}
    ${heroPill('<circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path>', MIND.irritability, 'No AI reads<br>your entries')}
  </div>
</div>`);

// === Closing card ===========================================================
// Not an app screen: the pricing and scope claims come from
// .agents/product-marketing.md and marketing/who-this-is-for.md. The one card
// on a porcelain ground, so the set visibly ends; the mark sits on it large
// because by the last card it has earned the space.
const priceRow = (label, value) => `<div style="background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 28px; padding: 40px 48px; display: flex; align-items: center; justify-content: space-between;">
      <span style="font-size: 36px; color: #b0b8c8;">${label}</span>
      <span style="font-size: 40px; color: ${TEXT}; font-weight: 600; letter-spacing: -0.02em;">${value}</span>
    </div>`;
boards['Closing.dc.html'] = dcPage(`<div style="width: 1290px; height: 2796px; box-sizing: border-box; background: ${FILL}; position: relative; overflow: hidden; font-family: ${FONT};">

  <div style="position: absolute; left: -400px; top: 1060px; width: 2090px; height: 1300px; border-radius: 50%; background: ${SLATE_TILE};"></div>
  <div style="position: absolute; left: -700px; top: 1240px; width: 2690px; height: 2400px; border-radius: 50%; background: ${GROUND};"></div>

  <div style="position: absolute; left: 345px; top: 330px; filter: drop-shadow(0 50px 70px rgba(10,12,18,0.35));">${logo('mk-close', 600, SLATE_TILE)}</div>

  <div style="position: absolute; left: 110px; right: 110px; top: 1440px; display: flex; flex-direction: column; align-items: center;">
    ${eyebrow('One payment', MIND.motivation)}
    <h1 style="margin: 24px 0 40px; font-family: ${DISPLAY}; font-size: 104px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: ${TEXT}; text-align: center;">AU$9.99 once.<br><span style="color: ${SITE.mute};">No subscription,<br>no ads.</span></h1>

    <p style="margin: 0 0 80px; font-family: ${DISPLAY}; font-size: 36px; line-height: 1.5; color: ${SITE.mute}; text-align: center; max-width: 900px;">Symetric doesn't diagnose, and you don't need a diagnosis to start.</p>

    <div style="display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 880px;">
      ${priceRow('Guarantee', '28 days, full refund')}
      ${priceRow('In-app purchases', 'None')}
      ${priceRow('Your data', 'Never sold')}
    </div>
  </div>
</div>`);

// === Aisha set ===============================================================
// A quieter set built for the persona (~/.claude/persona-aisha.md): sensitive
// to bright screens, has abandoned 3+ trackers, low capacity mid-week, smart
// enough not to need a tour. Her psychologist is 3 to 4 weeks apart, so each
// appointment has to count, and end-of-day logging fails her (by 9pm she has
// forgotten 11am). One idea per card, a few words each, nothing else outside
// the phone. The phone sits low and runs off the bottom edge, which drops the
// tab bar and leaves the frame mostly empty space. Dark throughout, the close
// included. The first three are what App Store search shows: the outcome, the
// effort, the payoff.
function aishaCard({ lines, app, accent }) {
  return dcPage(`<div style="width: 1290px; height: 2796px; box-sizing: border-box; background: ${GROUND}; position: relative; overflow: hidden; font-family: ${FONT};">

  <div style="position: absolute; left: 96px; right: 96px; top: 210px; display: flex; flex-direction: column; align-items: center;">
    ${colourBar(accent)}
    <h1 style="margin: 0; font-family: ${DISPLAY}; font-size: 112px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: ${TEXT}; text-align: center;">${lines.join('<br>')}</h1>
  </div>

  ${device(app, 'position: absolute; left: 136px; top: 760px;')}
</div>`);
}

boards['A1Appointment.dc.html'] = aishaCard({ lines: ['Make every', 'appointment count.'], app: { ...screens.report, scroll: 0 }, accent: MIND.energy });
boards['A2Moment.dc.html'] = aishaCard({ lines: ['Log it at 11am,', 'not at 9pm.'], app: screens.checkIn, accent: MIND.concentration });
boards['A3Patterns.dc.html'] = aishaCard({ lines: ["Links you'd never", 'spot yourself.'], app: screens.insights, accent: MIND.mood });
boards['A4Miss.dc.html'] = aishaCard({ lines: ['Miss a week.', 'Nothing breaks.'], app: screens.history, accent: MIND.sensory });
boards['A5Choose.dc.html'] = aishaCard({ lines: ['Track only', 'what you choose.'], app: screens.settings, accent: MIND.irritability });
boards['A6Change.dc.html'] = aishaCard({ lines: ['Did that change', 'actually help?'], app: screens.markers, accent: MIND.social });
boards['A7Price.dc.html'] = dcPage(`<div style="width: 1290px; height: 2796px; box-sizing: border-box; background: ${GROUND}; position: relative; overflow: hidden; font-family: ${FONT}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 96px;">
  ${logo('mk-aisha-close', 260, SLATE_TILE)}
  <span style="display: block; width: 96px; height: 10px; border-radius: 5px; background: ${MIND.motivation}; margin: 120px 0 40px;"></span>
  <h1 style="margin: 0; font-family: ${DISPLAY}; font-size: 112px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: ${TEXT}; text-align: center;">AU$9.99 once.<br>No subscription.</h1>
  <p style="margin: 48px 0 0; font-family: ${DISPLAY}; font-size: 44px; line-height: 1.4; color: ${SITE.mute}; text-align: center;">28-day guarantee.<br>No use to you? Full refund.</p>
</div>`);

// === Canvas layout =========================================================
// Two pages: the ten-card listing, and the five narrative captions on their
// own. Comfort.dc.html is generated but left off the canvas, as before -- it
// was dropped when comfort mode was only a brightness filter. Native comfort
// mode is visibly different (quiet accent, larger type, the one-tap), so it
// may now earn a slot; add it to RECOMMENDED to try it.
const GAP = 140;
// Main is the hero; the hook moved to slot 2 so CheckIn's "So answer it" still
// follows its question. BodyAddOn (a Settings toggle) gave up its slot --
// BodyTogether already says body tracking exists. It is still generated.
const RECOMMENDED = ['Main.dc.html', 'Hook.dc.html', 'CheckIn.dc.html',
  'Tracking.dc.html', 'BodyTogether.dc.html', 'History.dc.html',
  'Insights.dc.html', 'Markers.dc.html', 'Report.dc.html', 'Closing.dc.html'];
const NARRATIVE = ['N1Hook.dc.html', 'N2Answer.dc.html', 'N3Miss.dc.html',
  'N4Week6.dc.html', 'N5Pdf.dc.html'];
const AISHA = ['A1Appointment.dc.html', 'A2Moment.dc.html', 'A3Patterns.dc.html',
  'A4Miss.dc.html', 'A5Choose.dc.html', 'A6Change.dc.html', 'A7Price.dc.html'];

const place = (files, page) => files.map((file, i) => ({
  file, x: i * (1290 + GAP), y: 0, w: 1290, h: 2796, page,
  title: `${i + 1} · ${file === 'Main.dc.html' ? 'Hero' : file.replace(/^[NA]\d/, '').replace('.dc.html', '')}`,
}));

const canvas = {
  pages: [
    { id: 'page-1', name: 'Recommended 10' },
    { id: 'page-2', name: 'Narrative (5)' },
    { id: 'page-3', name: 'For Aisha (7)' },
  ],
  artboards: [...place(RECOMMENDED, 'page-1'), ...place(NARRATIVE, 'page-2'), ...place(AISHA, 'page-3')],
  launch: { view: 'canvas', page: 'page-1' },
};
const canvasJson = JSON.stringify(canvas, null, 2) + '\n';

for (const [name, html] of Object.entries(boards)) writeFileSync(name, html);
writeFileSync('canvas.json', canvasJson);

// -- Re-seed the canvas page -------------------------------------------------
// The published canvas keeps every artboard inside its own
// <script id="appifact-doc"> record. Swap the files in place and leave the
// editor code, title and comments exactly as they were. The canvas carries
// exactly the files its layout places, so Comfort and BodyAddOn stay off it.
const CANVAS_PAGE = 'symetric-app-store-screenshots.html';
const page = readFileSync(CANVAS_PAGE, 'utf8');
const re = /(<script type="application\/json" id="appifact-doc">)([\s\S]*?)(<\/script>)/;
const m = page.match(re);
if (!m) throw new Error('appifact-doc block not found in ' + CANVAS_PAGE);
const doc = JSON.parse(m[2]);
const placed = new Set([...RECOMMENDED, ...NARRATIVE, ...AISHA]);
const files = { 'canvas.json': canvasJson };
for (const name of placed) files[name] = boards[name];
doc.content.files = files;
// Escape '<' the way the original record does, so no '</script>' inside an
// artboard can close the block early.
const encoded = JSON.stringify(doc).replace(/</g, '\\u003c');
writeFileSync(CANVAS_PAGE, page.replace(re, (_, open, _body, close) => open + encoded + close));

console.log('wrote ' + Object.keys(boards).length + ' artboards + canvas.json, and re-seeded ' + CANVAS_PAGE);
