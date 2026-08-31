// Scoped port of the `pearson` function from the web app's
// src/lib/detection/computeConnection.ts (185 lines total — the rest of that
// file, significance testing and connection-record building, belongs to a
// later "domain connections" porting chunk; this correlation coefficient is
// the only piece lagRelationships.ts needs).

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx2 = 0,
    dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den < 1e-10 ? 0 : num / den;
}
