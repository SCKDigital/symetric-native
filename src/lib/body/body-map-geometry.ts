// The body map's geometry: the silhouette and where each site's hexagon sits
// on it. Pure numbers and SVG path strings, with no React Native, so the same
// shape is drawn by the app (components/body/body-map.tsx and the Insights
// heatmap) and printed in the PDF report (report/body-map-svg.ts).
//
// The marker coordinates are hand-tuned against the silhouette paths. One
// copy, used everywhere: a second would drift the first time either moved,
// and a map would quietly start pointing at the wrong joints.

export const CENTER_X = 120;
/** The silhouette's viewBox: 0 0 VIEW_W VIEW_H. */
export const VIEW_W = 240;
export const VIEW_H = 470;
/** Marker hexagon radius, in viewBox units. */
export const HEX_R = 15;

export interface MarkerLayout {
  region: string;
  y: number;
  offset: number; // 0 = midline (single marker on centerline)
}

// y/offset values match the point geometry below — jaw/neck/ribs sit on the
// head+torso contour, shoulder/elbow/wrist/hip/knee/ankle sit on the arm and
// leg point paths. Keep the two in sync if either moves.
export const FRONT_LAYOUT: MarkerLayout[] = [
  { region: 'jaw', y: 54, offset: 16 },
  { region: 'neck', y: 84, offset: 0 },
  { region: 'shoulder', y: 100, offset: 50 },
  { region: 'ribs', y: 145, offset: 0 },
  { region: 'elbow', y: 158, offset: 68 },
  { region: 'hip', y: 215, offset: 38 },
  { region: 'wrist', y: 220, offset: 76 },
  { region: 'fingers', y: 250, offset: 78 },
  { region: 'knee', y: 326, offset: 28 },
  { region: 'ankle', y: 406, offset: 22 },
];

export const BACK_LAYOUT: MarkerLayout[] = [
  { region: 'neck', y: 84, offset: 0 },
  { region: 'shoulder', y: 100, offset: 50 },
  { region: 'shoulder_blade', y: 122, offset: 30 },
  { region: 'elbow', y: 158, offset: 68 },
  { region: 'low_back', y: 190, offset: 0 },
  { region: 'si_joint', y: 208, offset: 18 },
  { region: 'wrist', y: 220, offset: 76 },
  { region: 'knee', y: 326, offset: 28 },
  { region: 'ankle', y: 406, offset: 22 },
];

/**
 * Anatomical (subject's) side, not viewer's — but mapped directly, not
 * mirrored: screen-left is always the subject's own left, on both front and
 * back views, like looking down at yourself rather than facing a mirror.
 * Getting this wrong is not recoverable later, so it's computed in exactly
 * one place.
 */
export function lateralX(side: 'L' | 'R', offset: number): number {
  const rightSign = side === 'R' ? -1 : 1;
  return CENTER_X - rightSign * offset;
}

export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// ── Silhouette ──────────────────────────────────────────────────────────────
//
// "Compact Bold" torso/arms/head with a two-stage-taper leg (thigh stays
// fuller through the knee, the calf narrows more sharply to the ankle) —
// picked from a set of proportion/taper mockups. Only the right half of the
// torso and one leg/arm are authored; the left side is a mirrored copy via
// MIRROR_TRANSFORM.

export interface Point { x: number; y: number; }

export const TORSO_POINTS: Point[] = [
  { x: CENTER_X, y: 86 }, { x: 170, y: 100 }, { x: 168, y: 128 },
  { x: 162, y: 170 }, { x: 170, y: 215 }, { x: CENTER_X, y: 235 },
];
export const ARM_POINTS: Point[] = [{ x: 170, y: 100 }, { x: 188, y: 158 }, { x: 196, y: 220 }];
export const LEG_POINTS: Point[] = [{ x: 158, y: 235 }, { x: 148, y: 326 }, { x: 142, y: 406 }];
export const LEG_RADII = [20, 17, 11]; // two-stage taper: thigh, knee, ankle half-widths
export const ARM_W = 28;
export const HAND_R = 13;
export const FOOT_R = 13;
export const NECK_Y = 70;
export const HEAD_R = 25;
export const MIRROR_TRANSFORM = 'matrix(-1,0,0,1,240,0)'; // reflects across CENTER_X within the 240-wide viewBox

// Catmull-Rom -> cubic bezier, open curve through pts (tension 1/6).
function smoothOpenPath(pts: Point[]): string {
  let d = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y} `;
  }
  return d;
}

// Filled, tapering limb through 3+ points, each with its own half-width
// (radius) — each segment is offset perpendicular to its own direction, so
// consecutive points form a chain of trapezoids rather than one constant
// width. Ends are rounded separately via small circles.
function taperedLimbPath(pts: Point[], radii: number[]): string {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ra = radii[i];
    const rb = radii[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x: a.x + nx * ra, y: a.y + ny * ra });
    left.push({ x: b.x + nx * rb, y: b.y + ny * rb });
    right.push({ x: a.x - nx * ra, y: a.y - ny * ra });
    right.push({ x: b.x - nx * rb, y: b.y - ny * rb });
  }
  let d = `M ${left[0].x.toFixed(1)} ${left[0].y.toFixed(1)} `;
  for (let i = 1; i < left.length; i++) d += `L ${left[i].x.toFixed(1)} ${left[i].y.toFixed(1)} `;
  for (let i = right.length - 1; i >= 0; i--) d += `L ${right[i].x.toFixed(1)} ${right[i].y.toFixed(1)} `;
  return d + 'Z';
}

export const TORSO_PATH = smoothOpenPath(TORSO_POINTS) + ` L ${CENTER_X} ${TORSO_POINTS[0].y} Z`;
export const LEG_PATH = taperedLimbPath(LEG_POINTS, LEG_RADII);
export const ARM_POINTS_STR = ARM_POINTS.map(p => `${p.x},${p.y}`).join(' ');
export const NECK_PATH = (() => {
  const half = HEAD_R * 0.7;
  const bottom = TORSO_POINTS[0].y;
  return `M ${CENTER_X - half} ${NECK_Y} L ${CENTER_X + half} ${NECK_Y} L ${CENTER_X + half - 2} ${bottom} L ${CENTER_X - half + 2} ${bottom} Z`;
})();

/** The silhouette as SVG markup, for contexts with no React (the PDF). The
 *  same shapes, in the same order, as body-map.tsx's <Silhouette>. */
export function silhouetteSvgMarkup(aspect: 'front' | 'back', fill: string, stroke: string): string {
  const [hip, knee, ankle] = LEG_POINTS;
  const hand = ARM_POINTS[ARM_POINTS.length - 1];
  const leg = `<path d="${LEG_PATH}" fill="${fill}"/>
    <circle cx="${hip.x}" cy="${hip.y}" r="${LEG_RADII[0]}" fill="${fill}"/>
    <circle cx="${knee.x}" cy="${knee.y}" r="${LEG_RADII[1]}" fill="${fill}"/>
    <circle cx="${ankle.x}" cy="${ankle.y + 14}" r="${FOOT_R}" fill="${fill}"/>`;
  const torso = `<path d="${TORSO_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`;
  const arm = `<polyline points="${ARM_POINTS_STR}" fill="none" stroke="${fill}" stroke-width="${ARM_W}" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${hand.x}" cy="${hand.y}" r="${HAND_R}" fill="${fill}"/>`;
  return `<g>${leg}</g><g transform="${MIRROR_TRANSFORM}">${leg}</g>
    ${torso}<g transform="${MIRROR_TRANSFORM}">${torso}</g>
    ${arm}<g transform="${MIRROR_TRANSFORM}">${arm}</g>
    <path d="${NECK_PATH}" fill="${fill}"/>
    <circle cx="${CENTER_X}" cy="${NECK_Y - HEAD_R - 2}" r="${HEAD_R}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    ${aspect === 'back' ? `<line x1="${CENTER_X}" y1="${TORSO_POINTS[0].y + 4}" x2="${CENTER_X}" y2="${TORSO_POINTS[5].y - 5}" stroke="${stroke}" stroke-width="1" opacity="0.5"/>` : ''}`;
}
