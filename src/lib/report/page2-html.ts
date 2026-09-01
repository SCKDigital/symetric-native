import type { LagRelationship } from '@/lib/detection/lag-relationships';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { buildDomainSparklineSectionHtml, buildEpisodeTimelineHtml, buildRareEventsSectionHtml } from '@/lib/report/page2-findings-html';
import type { ChartDomain, ChartMarker, SleepConnection } from '@/lib/report/chart-coordinates';
import { DOMAIN_LABELS } from '@/lib/report/theme';
import type { DetectedCluster } from '@/lib/supabase';

interface Page2Data {
  chartDomains: ChartDomain[];
  baselineMap: Record<string, number>;
  currentRollingMedians: Record<string, number>;
  chartHasEnoughData: boolean;
  chartMarkers: ChartMarker[];
  flaggedClusters: DetectedCluster[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
  rareEvents: RareEvent[];
  patternEvolution: PatternEvolution[];
  sleepConnections: SleepConnection[];
  sleepMedianHours: number | null;
  lagRelationships: LagRelationship[];
}

function fmtVal(v: number | undefined): string {
  return v != null ? (Math.round(v * 10) / 10).toFixed(1) : '-';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Ported from the web app's Page2Patterns.tsx ("Mind Overview") — the body
// content only (no <html>/<style> wrapper, that's shared across every page
// by report-document.ts). See that file's own header comment for the
// overall HTML-instead-of-component-tree approach this report uses.
export function buildPage2Html(data: Page2Data): string {
  const {
    chartDomains, baselineMap, currentRollingMedians, chartHasEnoughData,
    chartMarkers, flaggedClusters, dates, interventionImpacts,
    rareEvents, patternEvolution, sleepConnections, sleepMedianHours, lagRelationships,
  } = data;

  const sleepBaseline = baselineMap['sleep'] ?? 3;
  const sleepCurrent = currentRollingMedians['sleep'];
  const hasSleepData = sleepCurrent != null;
  const sleepDeviating = sleepCurrent != null && Math.abs(sleepCurrent - sleepBaseline) >= 0.5;
  const sleepLagNote = lagRelationships.find(r => r.predictor === 'sleep');

  const sleepDeviationSuffix = sleepDeviating ? (sleepCurrent! < sleepBaseline ? ' - below baseline' : ' - above baseline') : '';

  const sleepHoursRow = sleepMedianHours != null
    ? `<div class="sleep-row"><span class="sleep-label">Median hours slept</span><span class="sleep-value">${fmtVal(sleepMedianHours)} hours</span></div>`
    : '';

  const sleepConnectionsRow = sleepConnections.length > 0
    ? `<div class="sleep-row"><span class="sleep-label">Domain relationships</span><span class="sleep-value">${esc(sleepConnections.map(c => `${DOMAIN_LABELS[c.domain] ?? c.domain}: ${c.observation}`).join(' · '))}</span></div>`
    : '';

  const sleepLagHtml = sleepLagNote
    ? `<p class="sleep-note">Sleep is implicated in a lag relationship: ${esc(DOMAIN_LABELS[sleepLagNote.predictor as string] ?? sleepLagNote.predictor)} predicts ${esc(DOMAIN_LABELS[sleepLagNote.outcome as string] ?? sleepLagNote.outcome)} ${sleepLagNote.lagDays} day${sleepLagNote.lagDays !== 1 ? 's' : ''} later (${Math.round(sleepLagNote.instanceRate * 100)}% of occasions).</p>`
    : '';

  const noSleepDataHtml = !hasSleepData ? `<p class="empty-muted">Sleep not tracked in this period.</p>` : '';

  return `
    <div class="section-gap">
      <p class="section-label">Sleep</p>
      <div class="sleep-row">
        <span class="sleep-label">Average sleep score</span>
        <span class="sleep-value">${sleepCurrent != null ? fmtVal(sleepCurrent) : '-'} / 5 (personal baseline: ${fmtVal(sleepBaseline)})${sleepDeviationSuffix}</span>
      </div>
      ${sleepHoursRow}
      ${sleepConnectionsRow}
      ${sleepLagHtml}
      ${noSleepDataHtml}
    </div>

    ${buildDomainSparklineSectionHtml({ chartDomains, baselineMap, currentRollingMedians, chartHasEnoughData, chartMarkers, flaggedClusters, dates })}

    ${buildEpisodeTimelineHtml({ clusters: flaggedClusters, chartMarkers, dates, interventionImpacts, showMarkerNumbers: true })}

    ${buildRareEventsSectionHtml(rareEvents, patternEvolution)}

    <div class="explainer-box">
      <p class="explainer-title">Reading this page</p>
      <p class="explainer-text">Grey = within personal baseline, not "fine" in an absolute sense: a score typical for this individual can still look high or low on a standard scale.</p>
    </div>
  `;
}
