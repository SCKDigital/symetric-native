import { buildCircadianBarChartSvg, buildDayOfWeekBarChartSvg } from '@/lib/report/bar-charts-svg';
import { CORRELATION_MIN_ABS_R, CORRELATION_MIN_OVERLAP } from '@/lib/detection/compute-connection';
import { DOMAIN_LABELS } from '@/lib/report/theme';
import {
  groupClaimLine, groupEvidenceLine, groupHeadline, pairSentence,
  type CorrelationGroup, type CorrelationGrouping, type CorrelationPair,
} from '@/lib/correlation-groups';
import { CONFIDENCE_COPY, factorLabel, isBodyDomain } from '@/lib/pattern-findings';
import { CYCLE_WINDOW_DAYS, type CycleProximityResult } from '@/lib/detection/cycle-proximity';
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
  /** Pairs that were compared and showed nothing — rendered by its own
   *  module, passed in as HTML. */
  checkedNotFoundHtml: string;
}

/**
 * Symptoms in the week around a recorded cycle day 1.
 *
 * Day 1 has been drawn on the charts as a "C" since cycle tracking shipped
 * and never once compared against anything. In this population hormonal
 * modulation of dysautonomia, mast-cell and joint symptoms is well described
 * and — by the account of most of the people using this app — routinely
 * waved away. A dated, counted comparison is harder to wave away than a
 * recollection.
 */
function buildCycleHtml(results: CycleProximityResult[]): string {
  if (results.length === 0) return '';
  const cycles = results[0].cycles;
  const rows = results.slice(0, CYCLE_MAX_ROWS).map(r => `<tr>
    <td>${esc(factorLabel(r.domain))}</td>
    <td class="center">${r.nearMean.toFixed(1)}</td>
    <td class="center">${r.otherMean.toFixed(1)}</td>
    <td class="center">${r.difference > 0 ? '+' : ''}${r.difference.toFixed(1)}</td>
    <td class="center">${r.nearDays}/${r.otherDays}</td>
  </tr>`).join('');

  return `<div class="section-gap">
    <p class="section-label">Around cycle day 1</p>
    <table class="domain-table">
      <thead><tr>
        <th>Factor</th>
        <th class="center">Within ${CYCLE_WINDOW_DAYS} days</th>
        <th class="center">Other days</th>
        <th class="center">Difference</th>
        <th class="center">Days compared</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="empty-muted chart-note">${cycles} cycle start${cycles !== 1 ? 's' : ''} recorded in this period &middot; a mean comparison across the ${CYCLE_WINDOW_DAYS} days either side of each, against every other day with a reading &middot; no phase is inferred, and this is not a test of cause</p>
  </div>`;
}

/** Body factors are set in italics so a cross-system block is visible at a
 *  glance; sleep counts as neither and stays upright. */
const CYCLE_MAX_ROWS = 3;
const STANDALONE_MAX_PAIRS = 4;

function factorHtml(domain: string): string {
  const label = esc(factorLabel(domain));
  return isBodyDomain(domain) ? `<i>${label}</i>` : label;
}

function spansMindAndBody(members: string[]): boolean {
  return members.some(isBodyDomain) && members.some(m => !isBodyDomain(m) && m !== 'sleep');
}

function pairRow(pair: CorrelationPair): string {
  const direction = pair.movesTogether ? 'move together' : 'move in opposite directions';
  return `<tr>
    <td class="col-pair">${factorHtml(pair.a)} &amp; ${factorHtml(pair.b)}</td>
    <td class="col-dir">${direction}</td>
    <td class="col-n">${pair.sampleSize} days</td>
    <td class="col-n">${esc(CONFIDENCE_COPY[pair.grade].short)}</td>
  </tr>`;
}

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
    <table class="connections-table">
      <thead><tr><th class="col-pair">Pair</th><th class="col-dir">Direction</th><th class="col-n">Overlap</th><th class="col-n">Confidence</th></tr></thead>
      <tbody>${group.pairs.map(pairRow).join('')}</tbody>
    </table>
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
export function buildContextConnectionsHtml(data: ContextConnectionsData): string {
  const { dayOfWeekPatterns, circadianPatterns, grouping, domainConnections, cycleProximity, checkedNotFoundHtml } = data;
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

  const groupedHtml = hasGrouped
    ? `${grouping!.groups.map(groupBlock).join('')}
      ${grouping!.pairs.length > 0
        ? `<p class="group-standalone-label">On their own</p>
           ${grouping!.pairs.slice(0, STANDALONE_MAX_PAIRS).map(pair => `<div class="group-standalone">
             <span class="standalone-text">${esc(pairSentence(pair))}</span>
             <span class="standalone-meta">${pair.sampleSize} days &middot; ${esc(CONFIDENCE_COPY[pair.grade].short)}</span>
           </div>`).join('')}
           ${grouping!.pairs.length > STANDALONE_MAX_PAIRS ? `<p class="overflow-note">${grouping!.pairs.length - STANDALONE_MAX_PAIRS} further pair${grouping!.pairs.length - STANDALONE_MAX_PAIRS !== 1 ? 's' : ''} not listed.</p>` : ''}`
        : ''}
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

  return `
    <div class="section-gap">
      <p class="section-label">Time-based patterns</p>
      ${timePatternsHtml}
    </div>

    <div class="section-gap">
      <p class="section-label">What moves with what</p>
      ${connectionsHtml}
    </div>

    ${buildCycleHtml(cycleProximity)}

    ${checkedNotFoundHtml}
  `;
}
