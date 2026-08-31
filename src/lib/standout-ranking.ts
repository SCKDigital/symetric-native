// Ported from the web app's src/lib/standoutRanking.ts, unchanged — pure
// selection logic for the Insights "What stands out" summary.

import { Area, GRADE_ORDER, PatternFinding } from '@/lib/pattern-findings';

/**
 * Selects up to `maxCount` findings for "What stands out":
 *  1. Excludes 'limited' grade entirely — never surfaced here.
 *  2. Ranks by grade (solid first), then recency of onset, then effect size.
 *  3. Prefers variety of area: a candidate that introduces at least one area
 *     not yet represented is chosen over the next-best same-area candidate.
 */
export function selectStandoutFindings(findings: PatternFinding[], maxCount = 3): PatternFinding[] {
  const eligible = findings
    .filter(f => f.grade !== 'limited')
    .slice()
    .sort((a, b) => {
      if (GRADE_ORDER[a.grade] !== GRADE_ORDER[b.grade]) {
        return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
      }
      if (a.onsetDate !== b.onsetDate) {
        return b.onsetDate.localeCompare(a.onsetDate);
      }
      return b.effectSize - a.effectSize;
    });

  const selected: PatternFinding[] = [];
  const usedAreas = new Set<Area>();
  const remaining = [...eligible];

  while (selected.length < maxCount && remaining.length > 0) {
    let pickIndex = remaining.findIndex(f => f.areas.some(a => !usedAreas.has(a)));
    if (pickIndex === -1) pickIndex = 0;
    const [picked] = remaining.splice(pickIndex, 1);
    selected.push(picked);
    picked.areas.forEach(a => usedAreas.add(a));
  }

  return selected;
}
