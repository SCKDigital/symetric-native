import {
  BACK_LAYOUT, CENTER_X, FRONT_LAYOUT, HEX_R, VIEW_H, VIEW_W, hexPoints, lateralX, silhouetteSvgMarkup,
  type MarkerLayout,
} from '@/lib/body/body-map-geometry';
import { BODY_COLOR } from '@/lib/domains';
import type { BodySiteFrequency } from '@/lib/report/types';

// "Where it shows up", printed: the app's Insights body heatmap on paper. The
// same silhouette and hexagon positions (lib/body/body-map-geometry.ts), the
// same counts (computeBodySiteFrequency: distinct days per site), shaded the
// same way, front and back side by side because a page cannot flip between
// them. The ranked site list follows it on the page: the map says where, the
// list says how often, which a shade cannot.

const SILHOUETTE_FILL = '#EEF0F3';
const SILHOUETTE_STROKE = '#D5D9DF';
const UNLIT_FILL = '#FFFFFF';
const UNLIT_STROKE = '#C4C8CF';

/** Printed height of each figure, pt. */
export const BODY_MAP_HEIGHT_PT = 200;

/** Same curve as the app's heatmap: a site logged once is still clearly
 *  marked, the most-logged site is full strength. */
function intensityFor(dayCount: number, max: number): number {
  if (max <= 0) return 0;
  return 0.25 + 0.75 * (dayCount / max);
}

function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
}

function figure(aspect: 'front' | 'back', layout: MarkerLayout[], countFor: (region: string, side: 'L' | 'R' | null) => number, max: number): string {
  const hex = (region: string, side: 'L' | 'R' | null, x: number, y: number) => {
    const count = countFor(region, side);
    const lit = count > 0;
    return `<polygon points="${hexPoints(x, y, HEX_R)}" fill="${lit ? `${BODY_COLOR}${alphaHex(intensityFor(count, max))}` : UNLIT_FILL}" stroke="${lit ? BODY_COLOR : UNLIT_STROKE}" stroke-width="${lit ? 1.5 : 1}"/>`;
  };
  const hexes = layout.map(({ region, y, offset }) => offset === 0
    ? hex(region, null, CENTER_X, y)
    : (['L', 'R'] as const).map(side => hex(region, side, lateralX(side, offset), y)).join('')).join('');
  const widthPt = (BODY_MAP_HEIGHT_PT * VIEW_W) / VIEW_H;
  return `<div class="body-map-fig">
    <p class="body-map-caption">${aspect === 'front' ? 'Front' : 'Back'}</p>
    <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${widthPt.toFixed(1)}pt" height="${BODY_MAP_HEIGHT_PT}pt">
      ${silhouetteSvgMarkup(aspect, SILHOUETTE_FILL, SILHOUETTE_STROKE)}
      ${hexes}
    </svg>
    <div class="body-map-sides"><span>Patient's left</span><span>Patient's right</span></div>
  </div>`;
}

/**
 * Both views and a shading key. '' when no site was logged.
 *
 * Sides are the patient's own and printed as such: screen-left is the
 * patient's left on both views, like looking down at yourself, which is how
 * the app draws it and the opposite of a facing anatomical diagram.
 */
export function buildBodyMapHtml(sites: BodySiteFrequency[]): string {
  if (sites.length === 0) return '';

  // A region logged from either view is one fact ("left knee, 6 days"), so it
  // lights on whichever views carry that marker.
  const countByKey = new Map<string, number>();
  for (const s of sites) countByKey.set(`${s.region}|${s.side ?? ''}`, s.dayCount);
  const countFor = (region: string, side: 'L' | 'R' | null) => countByKey.get(`${region}|${side ?? ''}`) ?? 0;
  const max = sites.reduce((m, s) => Math.max(m, s.dayCount), 0);

  const placed = new Set<string>();
  for (const { region, offset } of [...FRONT_LAYOUT, ...BACK_LAYOUT]) {
    if (offset === 0) placed.add(`${region}|`);
    else { placed.add(`${region}|L`); placed.add(`${region}|R`); }
  }
  const unplaced = sites.filter(s => !placed.has(`${s.region}|${s.side ?? ''}`));

  const steps = [1, Math.round(max / 2), max].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const key = steps.map(n => `<span class="body-map-key-item"><span class="body-map-swatch" style="background:${BODY_COLOR}${alphaHex(intensityFor(n, max))}; border-color:${BODY_COLOR};"></span>${n} day${n !== 1 ? 's' : ''}</span>`).join('');

  return `<div class="body-map-row">
    ${figure('front', FRONT_LAYOUT, countFor, max)}
    ${figure('back', BACK_LAYOUT, countFor, max)}
    <div class="body-map-notes">
      <p class="body-map-note">Pain, instability and event sites logged in this period. Darker means logged on more days; an outlined hexagon was not logged.</p>
      <div class="body-map-key">${key}<span class="body-map-key-item"><span class="body-map-swatch" style="background:${UNLIT_FILL}; border-color:${UNLIT_STROKE};"></span>not logged</span></div>
      ${unplaced.length > 0 ? `<p class="body-map-note">Not on the map: ${unplaced.map(s => `${escapeHtml(s.label)} (${s.dayCount} day${s.dayCount !== 1 ? 's' : ''})`).join(', ')}.</p>` : ''}
      <p class="body-map-note">Every site, with its first and last day, is listed below.</p>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
