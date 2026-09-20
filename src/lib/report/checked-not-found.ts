import { CORRELATION_MIN_OVERLAP } from '@/lib/detection/compute-connection';
import type { DailyMeans } from '@/lib/report/chart-coordinates';
import { factorLabel } from '@/lib/pattern-findings';

// What was looked at and came back empty.
//
// The report has only ever printed what was found. For a patient whose
// recurring experience is being disbelieved, the absence of a relationship is
// evidence too, and printing it does two useful things: it shows the pairs
// were actually examined rather than overlooked, and it heads off the
// suggestion that the obvious explanation has not been considered. "Sleep
// quality and pain were compared across 41 days with no relationship found"
// is a sentence that ends a conversation about sleep hygiene.
//
// It also constrains the positive findings. A page listing six correlations
// with no denominator invites the reading that everything here correlates
// with everything; saying that thirty pairs were compared and six passed is
// the same page with its arithmetic shown.

const MAX_SHOWN = 4;

export interface CheckedPair {
  a: string;
  b: string;
  /** Days on which both had a reading. */
  overlap: number;
}

export interface CheckedNotFound {
  pairs: CheckedPair[];
  /** Every pair that had enough overlap to be testable. */
  tested: number;
  /** How many of those passed the threshold and appear as findings. */
  found: number;
}

/**
 * Pairs with enough overlapping days to be compared, that were compared, and
 * that showed nothing.
 *
 * `foundKeys` is the set of pairs already reported as connections, in either
 * order, as `a|b`.
 */
export function computeCheckedNotFound(
  dates: string[],
  dailyMeans: DailyMeans,
  trackedDomains: string[],
  foundKeys: Set<string>,
): CheckedNotFound {
  const factors = trackedDomains.filter(d => d !== 'sleep');
  const pairs: CheckedPair[] = [];
  let tested = 0;
  let found = 0;

  for (let i = 0; i < factors.length; i++) {
    for (let j = i + 1; j < factors.length; j++) {
      const a = factors[i];
      const b = factors[j];

      let overlap = 0;
      for (const date of dates) {
        if (dailyMeans[date]?.[a] != null && dailyMeans[date]?.[b] != null) overlap++;
      }
      // Below the overlap floor nothing was compared, so there is no result
      // to report either way — saying "no relationship" about a pair that was
      // never tested would be the same overclaiming in the other direction.
      if (overlap < CORRELATION_MIN_OVERLAP) continue;

      tested++;
      if (foundKeys.has(`${a}|${b}`) || foundKeys.has(`${b}|${a}`)) {
        found++;
        continue;
      }
      pairs.push({ a, b, overlap });
    }
  }

  // Best-evidenced negatives first: a null result over 50 days says more than
  // one over 15.
  pairs.sort((x, y) => y.overlap - x.overlap);
  return { pairs, tested, found };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildCheckedNotFoundHtml(result: CheckedNotFound): string {
  if (result.tested === 0) return '';

  const shown = result.pairs.slice(0, MAX_SHOWN);
  const hidden = result.pairs.length - shown.length;

  const list = shown.length === 0
    ? `<p class="empty-muted">Every pair with enough overlapping days showed a relationship.</p>`
    : shown.map(p => `<div class="group-standalone">
        <span class="standalone-text">${esc(factorLabel(p.a))} and ${esc(factorLabel(p.b))}</span>
        <span class="standalone-meta">${p.overlap} days &middot; no relationship</span>
      </div>`).join('');

  return `<div class="section-gap">
    <p class="section-label">Compared, nothing found</p>
    <p class="group-claim">${result.tested} pair${result.tested !== 1 ? 's' : ''} had enough overlapping days to compare. ${result.found} showed a relationship; the rest did not.</p>
    ${list}
    ${hidden > 0 ? `<p class="overflow-note">${hidden} further pair${hidden !== 1 ? 's' : ''} with no relationship not listed.</p>` : ''}
    <p class="sleep-chart-caption">A null result is not proof of no connection - only that none was visible in this period, at this amount of data.</p>
  </div>`;
}
