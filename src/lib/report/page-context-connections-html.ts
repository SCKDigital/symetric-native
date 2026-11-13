import { buildCircadianBarChartSvg, buildDayOfWeekBarChartSvg } from '@/lib/report/bar-charts-svg';
import { CORRELATION_MIN_ABS_R, CORRELATION_MIN_OVERLAP } from '@/lib/detection/compute-connection';
import { DOMAIN_LABELS } from '@/lib/report/theme';
import { flowPages, type FlowSection } from '@/lib/report/flow-pages';
import {
  groupClaimLine, groupEvidenceLine, groupHeadline, pairSentence,
  type CorrelationGroup, type CorrelationGrouping,
} from '@/lib/correlation-groups';
import { CONFIDENCE_COPY, factorLabel, isBodyDomain } from '@/lib/pattern-findings';
import {
  CYCLE_WINDOW_DAYS, MAX_CYCLE_LENGTH, MIN_CYCLE_LENGTH, PRE_DAY_ONE_WINDOW_DAYS,
  type CompletedCycle, type CycleProximityResult,
} from '@/lib/detection/cycle-proximity';
import type { DayOfWeekPattern } from '@/lib/detection/day-of-week-patterns';
import type { CircadianPattern } from '@/lib/circadian-detection';
import type { DomainConnection } from '@/lib/report/chart-coordinates';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtAvg(n: number | null | undefined): string {
  if (n == null) return '-';
  return (Math.round(n * 10) / 10).toFixed(1);
}

type StrongestTime = { type: 'dow'; pattern: DayOfWeekPattern } | { type: 'circadian'; pattern: CircadianPattern } | null;

function findStrongestTimePattern(dowPatterns: DayOfWeekPattern[], circadianPatterns: CircadianPattern[]): StrongestTime {
  let best: StrongestTime = null;
  let bestDiff = 0;
  for (const p of dowPatterns) {
    if (p.difference > bestDiff) { bestDiff = p.difference; best = { type: 'dow', pattern: p }; }
  }
  for (const p of circadianPatterns) {
    if (p.range > bestDiff) { bestDiff = p.range; best = { type: 'circadian', pattern: p }; }
  }
  return best;
}

interface ContextConnectionsData {
  dayOfWeekPatterns: DayOfWeekPattern[];
  circadianPatterns: CircadianPattern[];
  /** The detector's own persisted connections, grouped — mind AND body, the
   *  same blocks Insights shows. Null when nothing has been persisted for a
   *  window overlapping this range. */
  grouping: CorrelationGrouping | null;
  /** Mind-only pairs computed in this file's own pass, used only when the
   *  detector has nothing for this range. */
  domainConnections: DomainConnection[];
  /** Symptoms near a recorded cycle day 1. Empty when cycle tracking is off,
   *  or when too few cycles fall in the range to compare. */
  cycleProximity: CycleProximityResult[];
  /** Symptoms in the week before each Day 1 that ends a completed cycle. */
  preDayOne: CycleProximityResult[];
  /** Every gap between consecutive Day 1s in the period, unusual ones
   *  included. Empty when cycle tracking is off or excluded. */
  cycleIntervals: (CompletedCycle & { usable: boolean })[];
  /** Pairs that were compared and showed nothing — rendered by its own
   *  module, passed in as HTML. */
  /** buildCheckedNotFoundSection's output; null when nothing was compared. */
  checkedNotFound: FlowSection | null;
}

interface CycleSectionData {
  /** Around Day 1, either side. */
  proximity: CycleProximityResult[];
  /** The week before each Day 1 that ends a completed cycle. */
  preDayOne: CycleProximityResult[];
  /** Every gap between consecutive Day 1s in the period. */
  intervals: (CompletedCycle & { usable: boolean })[];
}

const TABLE_HEADER_PT = 14;
const TABLE_ROW_PT = 16;

function cycleSection(title: string, results: CycleProximityResult[], nearHeading: string, otherHeading: string, note: string, lead = ''): FlowSection {
  return {
    title,
    open: {
      html: `${lead}<table class="domain-table">
      <thead><tr>
        <th>Factor</th>
        <th class="center">${nearHeading}</th>
        <th class="center">${otherHeading}</th>
        <th class="center">Difference</th>
        <th class="center">Days compared</th>
      </tr></thead>
      <tbody>`,
      heightPt: TABLE_HEADER_PT + (lead ? 30 : 0),
    },
    rows: results.map(r => ({
      html: `<tr>
    <td>${esc(factorLabel(r.domain))}</td>
    <td class="center">${r.nearMean.toFixed(1)}</td>
    <td class="center">${r.otherMean.toFixed(1)}</td>
    <td class="center">${r.difference > 0 ? '+' : ''}${r.difference.toFixed(1)}</td>
    <td class="center">${r.nearDays}/${r.otherDays}</td>
  </tr>`,
      heightPt: TABLE_ROW_PT,
    })),
    close: '</tbody></table>',
    footer: { html: `<p class="empty-muted chart-note">${note}</p>`, heightPt: 26 },
  };
}

/**
 * Cycle lengths as recorded, and symptoms around a recorded cycle day 1 and
 * in the week before it.
 *
 * Day 1 has been drawn on the charts as a "C" since cycle tracking shipped
 * and never once compared against anything. In this population hormonal
 * modulation of dysautonomia, mast-cell and joint symptoms is well described
 * and — by the account of most of the people using this app — routinely
 * waved away. A dated, counted comparison is harder to wave away than a
 * recollection.
 *
 * The lengths come first and are listed whole, unusual ones included: an
 * irregular cycle is itself a finding, and the reader is the one placed to
 * say whether a long gap was a missed log or a long cycle. Every factor is
 * listed in both tables; they used to share a three-row budget.
 */
function buildCycleSections({ proximity, preDayOne, intervals }: CycleSectionData): FlowSection[] {
  if (proximity.length === 0 && preDayOne.length === 0 && intervals.length === 0) return [];

  const unusual = intervals.filter(c => !c.usable);
  const lengthsHtml = intervals.length > 0
    ? `<p class="sleep-note">Days between logged Day 1s: ${intervals.map(c => `${c.lengthDays}${c.usable ? '' : '*'}`).join(', ')}.${unusual.length > 0 ? ` *Outside ${MIN_CYCLE_LENGTH}-${MAX_CYCLE_LENGTH} days, so possibly a missed or repeated log; left out of the week-before comparison.` : ''}</p>`
    : '';
  const caveat = 'Mean comparisons only &middot; no phase is inferred, and this is not a test of cause';

  const sections: FlowSection[] = [];
  if (proximity.length > 0) {
    sections.push(cycleSection('Around cycle day 1', proximity, `Within ${CYCLE_WINDOW_DAYS} days`, 'Other days',
      `${proximity[0].cycles} cycle start${proximity[0].cycles !== 1 ? 's' : ''} &middot; the ${CYCLE_WINDOW_DAYS} days either side of each Day 1 against every other day &middot; ${caveat}`, lengthsHtml));
  } else if (lengthsHtml) {
    sections.push({ title: 'Around cycle day 1', rows: [{ html: lengthsHtml, heightPt: 30 }] });
  }
  if (preDayOne.length > 0) {
    sections.push(cycleSection('The week before cycle day 1', preDayOne, `${PRE_DAY_ONE_WINDOW_DAYS} days before`, 'Rest of cycle',
      `${preDayOne[0].cycles} completed cycle${preDayOne[0].cycles !== 1 ? 's' : ''} &middot; counted back from the Day 1 that ends each, against the rest of the same cycles &middot; ${caveat}`));
  }
  return sections;
}

/** Body factors are set in italics so a cross-system block is visible at a
 *  glance; sleep counts as neither and stays upright. */
const STANDALONE_MAX_PAIRS = 4;

function factorHtml(domain: string): string {
  const label = esc(factorLabel(domain));
  return isBodyDomain(domain) ? `<i>${label}</i>` : label;
}

function spansMindAndBody(members: string[]): boolean {
  return members.some(isBodyDomain) && members.some(m => !isBodyDomain(m) && m !== 'sleep');
}

// No inner pairs table. The app's own card renders the same headline/chips/
// claim/evidence by default and keeps the pair-by-pair breakdown behind a
// "show the N pairs behind this" tap — collapsed unless asked for. A printed
// page can't collapse anything, so showing the table unconditionally meant
// showing it always: a chain of five domains compared across a 90-day range
// put thirty-odd rows on the page for a claim the three summary lines above
// it already make. The individual, ungrouped pairs below (buildContextConnectionsHtml's
// standaloneHtml) are the report's "each individual pair" tier; a block is
// the other tier, and states its own claim rather than itemising its edges.
function groupBlock(group: CorrelationGroup): string {
  const crossSystem = spansMindAndBody(group.members);
  return `<div class="group-block">
    <div class="group-head">
      <span class="group-title">${esc(groupHeadline(group))}</span>
      <span class="group-grade">${esc(CONFIDENCE_COPY[group.grade].short)}</span>
    </div>
    <p class="group-members">${group.members.map(factorHtml).join(' &middot; ')}</p>
    <p class="group-claim">${esc(groupClaimLine(group))}</p>
    <p class="group-evidence">${esc(groupEvidenceLine(group))}${crossSystem ? ' &middot; <strong>links mind and body</strong>' : ''}</p>
  </div>`;
}

// Ported from the web app's Page3Charts.tsx ("Context & Connections").
// Named by role, not position — unlike page1-html.ts/page2-html.ts (always
// the report's first two pages), this page's position shifts depending on
// which other pages exist (e.g. it moves back a slot once a Body Overview
// page is ported), so a page-N name would go stale the way page3-html.ts's
// original name did the moment this page was inserted before it — see
// page-data-quality-html.ts's header comment for that history.
//
// The connections half is no longer that port. It reads the same persisted
// domain_connections rows Insights does and groups them with the same
// correlation-groups.ts, so the report and the app state the same findings in
// the same words — including body×mind edges, which the in-report computation
// could never produce because it only ever saw mind check-ins. The in-report
// pairs remain as a fallback for a range the weekly detector has not covered.
/** One page body per sheet: time patterns and connections first, then the
 *  cycle comparison and the pairs that showed nothing, on continuation pages
 *  of their own. Together they measured 102% of a sheet on the sample
 *  report, spilling onto an unnumbered page. */
export function buildContextConnectionsPages(data: ContextConnectionsData): string[] {
  const { dayOfWeekPatterns, circadianPatterns, grouping, domainConnections, cycleProximity, preDayOne, cycleIntervals, checkedNotFound } = data;
  const strongest = findStrongestTimePattern(dayOfWeekPatterns, circadianPatterns);

  let timePatternsHtml: string;
  if (strongest == null) {
    timePatternsHtml = `<p class="empty-muted">No day-of-week or time-of-day pattern detected above confidence threshold this period.</p>`;
  } else {
    let leftHtml: string;
    if (strongest.type === 'dow') {
      const p = strongest.pattern;
      const sub = p.type === 'weekday_weekend'
        ? `Weekday avg ${fmtAvg(p.weekdayAvg)} vs weekend ${fmtAvg(p.weekendAvg)} (${p.checkInCount} check-ins)`
        : `${p.dayName}s avg ${fmtAvg(p.standoutAvg)} vs other days ${fmtAvg(p.comparisonAvg)}`;
      leftHtml = `<p class="chart-title">${esc(DOMAIN_LABELS[p.domain] ?? p.domain)} - Day of week</p>
        ${buildDayOfWeekBarChartSvg(p)}
        <p class="empty-muted chart-note">${esc(sub)}</p>`;
    } else {
      const p = strongest.pattern;
      const highestAvg = p[`${p.highest_block.toLowerCase()}_avg` as keyof CircadianPattern] as number | null;
      leftHtml = `<p class="chart-title">${esc(DOMAIN_LABELS[p.domain] ?? p.domain)} - Time of day</p>
        ${buildCircadianBarChartSvg(p)}
        <p class="empty-muted chart-note">Highest: ${esc(p.highest_block)} (avg ${fmtAvg(highestAvg)}), lowest: ${esc(p.lowest_block)} &middot; range ${fmtAvg(p.range)} pts</p>`;
    }

    const secondDow = dayOfWeekPatterns.find(p => strongest.type !== 'dow' || p !== strongest.pattern);
    const secondCirc = circadianPatterns.find(p => strongest.type !== 'circadian' || p !== strongest.pattern);
    const second = strongest.type === 'dow' ? secondCirc : secondDow;

    let rightHtml: string;
    if (!second) {
      rightHtml = `<div class="chart-empty"><p class="empty-muted">No second pattern detected.</p></div>`;
    } else if ('morning_avg' in second) {
      rightHtml = `<p class="chart-title">${esc(DOMAIN_LABELS[second.domain] ?? second.domain)} - Time of day</p>${buildCircadianBarChartSvg(second)}`;
    } else {
      rightHtml = `<p class="chart-title">${esc(DOMAIN_LABELS[second.domain] ?? second.domain)} - Day of week</p>${buildDayOfWeekBarChartSvg(second)}`;
    }

    timePatternsHtml = `<div class="two-col"><div class="chart-col">${leftHtml}</div><div class="chart-col">${rightHtml}</div></div>`;
  }

  // What the app itself found, not a weaker re-derivation of it. The detector
  // persists mind AND body connections and Insights groups them into blocks;
  // this page used to show a flat list of mind-only pairs computed in-report,
  // so the cross-system links — the ones a clinician is least able to spot
  // unaided, and the whole reason both systems are tracked in one app — never
  // reached the person the report is written for.
  const hasGrouped = grouping != null && (grouping.groups.length > 0 || grouping.pairs.length > 0);

  const groupBlocksHtml = grouping?.groups.map(groupBlock).join('') ?? '';
  const standaloneHtml = grouping != null && grouping.pairs.length > 0
    ? `<p class="group-standalone-label">On their own</p>
       ${grouping.pairs.slice(0, STANDALONE_MAX_PAIRS).map(pair => `<div class="group-standalone">
         <span class="standalone-text">${esc(pairSentence(pair))}</span>
         <span class="standalone-meta">${pair.sampleSize} days &middot; ${esc(CONFIDENCE_COPY[pair.grade].short)}</span>
       </div>`).join('')}
       ${grouping.pairs.length > STANDALONE_MAX_PAIRS ? `<p class="overflow-note">${grouping.pairs.length - STANDALONE_MAX_PAIRS} further pair${grouping.pairs.length - STANDALONE_MAX_PAIRS !== 1 ? 's' : ''} not listed.</p>` : ''}`
    : '';

  // Chains and standalone pairs are two different shapes of the same list —
  // side by side when both exist, same reasoning as the cycle/checked-not-
  // found pairing below, rather than one stacked under the other.
  const groupedHtml = hasGrouped
    ? `${groupBlocksHtml && standaloneHtml
        ? `<div class="two-col"><div class="chart-col">${groupBlocksHtml}</div><div class="chart-col">${standaloneHtml}</div></div>`
        : `${groupBlocksHtml}${standaloneHtml}`}
      <p class="empty-muted chart-note">Body factors in italics. A block is a chain of measured pairs, not a claim that every factor in it was compared with every other &middot; correlation is not causation</p>`
    : '';

  const fallbackHtml = domainConnections.length === 0
    ? `<p class="empty-muted">No domain pairs above threshold (min ${CORRELATION_MIN_OVERLAP} overlapping check-ins, |r| &gt;= ${CORRELATION_MIN_ABS_R}).</p>`
    : `<table class="connections-table">
        <thead><tr><th class="col-pair">Domain pair</th><th class="col-dir">Relationship</th><th class="col-n">Mind check-ins</th></tr></thead>
        <tbody>
          ${domainConnections.map(c => `<tr>
            <td class="col-pair">${esc(DOMAIN_LABELS[c.domainA] ?? c.domainA)} &amp; ${esc(DOMAIN_LABELS[c.domainB] ?? c.domainB)}</td>
            <td class="col-dir">${c.direction === 'positive' ? 'Rise and fall together' : 'Move inversely - one high when other low'}</td>
            <td class="col-n">${c.n}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="empty-muted chart-note">Mind domains only, computed for this report &middot; threshold: min ${CORRELATION_MIN_OVERLAP} overlapping check-ins &middot; correlation not causation</p>`;

  const connectionsHtml = hasGrouped ? groupedHtml : fallbackHtml;

  const firstPage = `
    <div class="section-gap">
      <p class="section-label">Time-based patterns</p>
      ${timePatternsHtml}
    </div>

    <div class="section-gap">
      <p class="section-label">What moves with what</p>
      ${connectionsHtml}
    </div>
  `;

  const rest = [
    ...buildCycleSections({ proximity: cycleProximity, preDayOne, intervals: cycleIntervals }),
    ...(checkedNotFound ? [checkedNotFound] : []),
  ];
  return rest.length > 0 ? [firstPage, ...flowPages(rest)] : [firstPage];
}
