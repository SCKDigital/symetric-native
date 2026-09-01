import { buildCircadianBarChartSvg, buildDayOfWeekBarChartSvg } from '@/lib/report/bar-charts-svg';
import { CORRELATION_MIN_ABS_R, CORRELATION_MIN_OVERLAP } from '@/lib/detection/compute-connection';
import { DOMAIN_LABELS } from '@/lib/report/theme';
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
  domainConnections: DomainConnection[];
}

// Ported from the web app's Page3Charts.tsx ("Context & Connections").
// Named by role, not position — unlike page1-html.ts/page2-html.ts (always
// the report's first two pages), this page's position shifts depending on
// which other pages exist (e.g. it moves back a slot once a Body Overview
// page is ported), so a page-N name would go stale the way page3-html.ts's
// original name did the moment this page was inserted before it — see
// page-data-quality-html.ts's header comment for that history.
//
// persistedConnections' "held steady across two windows" annotation is
// omitted — it's sourced from the weekly-cron domain_connections table
// (queries/connections.ts's fetchLatestDomainConnections), which isn't
// ported to native (same deferral noted for the weekly-cadence detectors
// since Insights chunk 1). Every domain connection this page shows is
// still real, just without that one extra annotation.
export function buildContextConnectionsHtml(data: ContextConnectionsData): string {
  const { dayOfWeekPatterns, circadianPatterns, domainConnections } = data;
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

  const connectionsHtml = domainConnections.length === 0
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
      <p class="empty-muted chart-note">Threshold: min ${CORRELATION_MIN_OVERLAP} overlapping check-ins &middot; correlation not causation</p>`;

  return `
    <div class="section-gap">
      <p class="section-label">Time-based patterns</p>
      ${timePatternsHtml}
    </div>

    <div class="section-gap">
      <p class="section-label">Connections between domains</p>
      ${connectionsHtml}
    </div>
  `;
}
