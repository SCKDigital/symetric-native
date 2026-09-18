// ── Correlation grouping ────────────────────────────────────────────────────
//
// Connected-component grouping over the persisted domain_connections rows.
//
// The drill-downs used to render one card per correlated pair. Five correlated
// factors is ten cards, and thirteen tracked factors allow seventy-eight — so
// the Body screen opened with four cards that all said "End of day exhaustion"
// and the finding they were circling was never stated anywhere. The reader was
// left to join the edges up in their head, which is the one thing the person
// whose concentration is being measured should not be asked to do.
//
// Components are built over the move-together edges only. A block mixing
// directions cannot be described in one sentence without lying about half of
// it, so opposing pairs stay as their own cards.
//
// Pure and synchronous, no DB or network access — same contract as
// pattern-findings.ts. Do not add detection logic here; this only reshapes
// what the detector already persisted.

import { movesTogetherForReader } from '@/lib/domain-polarity';
import { factorLabel, GRADE_ORDER, type Grade } from '@/lib/pattern-findings';

/** One persisted domain_connections row, as both drill-downs receive it. */
export interface ConnectionRow {
  domain_a: string;
  domain_b: string;
  moves_together: boolean;
  strength: number;
  sample_size: number;
  window_end: string;
}

export interface CorrelationPair {
  a: string;
  b: string;
  /** Reader direction, not raw — see domain-polarity.ts. */
  movesTogether: boolean;
  strength: number;
  sampleSize: number;
  grade: Grade;
}

export interface CorrelationGroup {
  /** Stable across renders: the sorted member list. */
  id: string;
  /** Most-connected factor first, so the block leads with its hub. */
  members: string[];
  pairs: CorrelationPair[];
  /**
   * The weakest grade of any edge in the block. A block claim is only as good
   * as the thinnest evidence holding it together, and this app would rather
   * under-claim than let a Partial edge ride in on a Firm one.
   */
  grade: Grade;
  minSample: number;
  maxSample: number;
}

export interface CorrelationGrouping {
  groups: CorrelationGroup[];
  /** Everything not in a block: opposing pairs, and two-factor components. */
  pairs: CorrelationPair[];
  /** Cards this grouping will render — for a section's count label. */
  cardCount: number;
}

/** Matches the threshold bodyMindConnectionFindings grades on. */
function gradeForStrength(strength: number): Grade {
  return strength >= 0.7 ? 'solid' : 'partial';
}

function toPair(row: ConnectionRow): CorrelationPair {
  return {
    a: row.domain_a,
    b: row.domain_b,
    movesTogether: movesTogetherForReader(row.domain_a, row.domain_b, row.moves_together),
    strength: row.strength,
    sampleSize: row.sample_size,
    grade: gradeForStrength(row.strength),
  };
}

function weakest(pairs: CorrelationPair[]): Grade {
  return pairs.reduce<Grade>(
    (worst, p) => (GRADE_ORDER[p.grade] > GRADE_ORDER[worst] ? p.grade : worst),
    'solid',
  );
}

function byGradeThenStrength(a: CorrelationPair, b: CorrelationPair): number {
  if (GRADE_ORDER[a.grade] !== GRADE_ORDER[b.grade]) return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
  return b.strength - a.strength;
}

export function groupConnections(rows: ConnectionRow[]): CorrelationGrouping {
  const all = rows.map(toPair);
  const together = all.filter(p => p.movesTogether);
  const loose: CorrelationPair[] = all.filter(p => !p.movesTogether);

  // Union-find over the move-together edges.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    if (root === x) {
      parent.set(x, x);
      return x;
    }
    root = find(root);
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  together.forEach(p => union(p.a, p.b));

  const byRoot = new Map<string, CorrelationPair[]>();
  together.forEach(p => {
    const root = find(p.a);
    const list = byRoot.get(root);
    if (list) list.push(p);
    else byRoot.set(root, [p]);
  });

  const groups: CorrelationGroup[] = [];
  byRoot.forEach(pairs => {
    const degree = new Map<string, number>();
    pairs.forEach(p => {
      degree.set(p.a, (degree.get(p.a) ?? 0) + 1);
      degree.set(p.b, (degree.get(p.b) ?? 0) + 1);
    });
    const members = [...degree.keys()];

    // A two-factor component is a pair with extra steps — nothing is gained by
    // wrapping "A and B move together" in a block heading that says the same.
    if (members.length < 3) {
      loose.push(...pairs);
      return;
    }

    members.sort((x, y) =>
      (degree.get(y) ?? 0) - (degree.get(x) ?? 0) || factorLabel(x).localeCompare(factorLabel(y)));
    const samples = pairs.map(p => p.sampleSize);

    groups.push({
      id: [...members].sort().join('|'),
      members,
      pairs: [...pairs].sort(byGradeThenStrength),
      grade: weakest(pairs),
      minSample: Math.min(...samples),
      maxSample: Math.max(...samples),
    });
  });

  groups.sort((a, b) =>
    b.members.length - a.members.length
    || GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]
    || a.id.localeCompare(b.id));
  loose.sort(byGradeThenStrength);

  return { groups, pairs: loose, cardCount: groups.length + loose.length };
}

const NUMBER_WORDS = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Five things move together" — the block's claim, in one line. */
export function groupHeadline(group: CorrelationGroup): string {
  const word = NUMBER_WORDS[group.members.length] ?? String(group.members.length);
  return `${word} things move together`;
}

/**
 * What the block is entitled to claim, which depends on how much of it was
 * actually measured.
 *
 * A block is a connected component, so five factors can be joined by as few as
 * four edges out of the ten pairings between them. "When one of these is bad,
 * the others usually are too" asserts all ten. For a partly-connected block
 * that is a claim about pairs the detector never compared — and this app's
 * findings are read out to clinicians by people whose symptoms have been
 * explained away for years, so a sentence that says more than the data does is
 * worse than no sentence at all.
 *
 * A fully-connected block has earned the strong wording, so it still gets it.
 */
export function groupClaimLine(group: CorrelationGroup): string {
  const n = group.members.length;
  const complete = group.pairs.length >= (n * (n - 1)) / 2;
  return complete
    ? 'When one of these is bad, the others usually are too.'
    : 'Each of these moved with at least one other. Not every pair was compared.';
}

/** "16–20 days compared", or "17 days compared" when every edge agrees. */
export function groupEvidenceLine(group: CorrelationGroup): string {
  const range = group.minSample === group.maxSample
    ? `${group.minSample}`
    : `${group.minSample}–${group.maxSample}`;
  return `${range} days compared`;
}

/** The sentence a single pair gets, matching bodyMindConnectionFindings. */
export function pairSentence(pair: CorrelationPair): string {
  const verb = pair.movesTogether ? 'tend to move together' : 'tend to move in opposite directions';
  return `Your ${factorLabel(pair.a)} and ${factorLabel(pair.b)} ${verb}.`;
}
