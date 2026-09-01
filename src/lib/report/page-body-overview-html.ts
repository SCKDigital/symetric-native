import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { BODY_COLOR } from '@/lib/domains';
import { buildDomainSparklineSectionHtml, buildEpisodeTimelineHtml, buildRareEventsSectionHtml } from '@/lib/report/page2-findings-html';
import type { ChartDomain, ChartMarker } from '@/lib/report/chart-coordinates';
import type { BodyEventOccurrence, BodySiteFrequency } from '@/lib/report/types';
import type { DetectedCluster } from '@/lib/supabase';

interface BodyOverviewData {
  bodyChartDomains: ChartDomain[];
  bodyBaselineMap: Record<string, number>;
  bodyCurrentRollingMedians: Record<string, number>;
  bodyChartHasEnoughData: boolean;
  bodyEventOccurrences: BodyEventOccurrence[];
  bodySiteFrequency: BodySiteFrequency[];
  bodyFlaggedClusters: DetectedCluster[];
  chartMarkers: ChartMarker[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
  bodyRareEvents: RareEvent[];
  bodyPatternEvolution: PatternEvolution[];
}

// Capped the same way EpisodeTimeline/RareEventsSection are, for the same
// overflow reason (see the web app's Page3BodyOverview.tsx's own KNOWN GAP
// comment about this page being the busiest one and needing the same
// dedicated overflow follow-up as Page 2 — not fixed here either).
const BODY_EVENT_MAX_ENTRIES = 4;
const SITE_MAX_ENTRIES = 5;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Ported from the web app's lib/report/sections/Page3BodyOverview.tsx
// ("Body Overview") — the body counterpart to Page 2's Mind Overview: same
// sparkline + event timeline + rare-events shape, reusing page2-findings-
// html.ts's already-generic section builders (BODY_COLOR + `() => true`
// passed for the sparkline color/isLowerBetterFn — every body domain is a
// severity scale, see theme.ts's LOWER_IS_BETTER comment), plus two things
// body has and mind doesn't: a dated event table and a ranked site-frequency
// list for where pain/instability occurred. Domain averages live on Page 1
// alongside the mind table (Page 1 itself stays mind-only for now — see
// generate-report.ts's header comment for that deferral).
export function buildBodyOverviewHtml(data: BodyOverviewData): string {
  const {
    bodyChartDomains, bodyBaselineMap, bodyCurrentRollingMedians, bodyChartHasEnoughData,
    bodyEventOccurrences, bodySiteFrequency, bodyFlaggedClusters, chartMarkers, dates,
    interventionImpacts, bodyRareEvents, bodyPatternEvolution,
  } = data;

  const shownEvents = bodyEventOccurrences.slice(0, BODY_EVENT_MAX_ENTRIES);
  const olderEventCount = bodyEventOccurrences.length - shownEvents.length;

  const shownSites = bodySiteFrequency.slice(0, SITE_MAX_ENTRIES);
  const olderSiteCount = bodySiteFrequency.length - shownSites.length;

  const eventTableHtml = shownEvents.length === 0
    ? `<p class="empty-muted">No events logged in this period.</p>`
    : `
      <div class="event-table-header-row">
        <span class="event-col-date-h">Date</span>
        <span class="event-col-type-h">Event</span>
        <span class="event-col-detail-h">Context</span>
      </div>
      ${shownEvents.map(ev => `
        <div class="event-table-row">
          <span class="event-col-date">${esc(fmtDay(ev.date))}</span>
          <span class="event-col-type">${esc(ev.label)}</span>
          <span class="event-col-detail">${esc(ev.context ?? '-')}</span>
        </div>`).join('')}
      ${olderEventCount > 0 ? `<p class="overflow-note">${olderEventCount} earlier event${olderEventCount !== 1 ? 's' : ''} not shown.</p>` : ''}
    `;

  const siteListHtml = shownSites.length === 0
    ? `<p class="empty-muted">No sites logged in this period.</p>`
    : `
      ${shownSites.map(site => `
        <div class="site-row">
          <span class="site-label">${esc(site.label)}</span>
          <span class="site-count">${site.dayCount} day${site.dayCount !== 1 ? 's' : ''}</span>
        </div>`).join('')}
      ${olderSiteCount > 0 ? `<p class="overflow-note">${olderSiteCount} more region${olderSiteCount !== 1 ? 's' : ''} not shown.</p>` : ''}
    `;

  return `
    ${buildDomainSparklineSectionHtml({
      chartDomains: bodyChartDomains,
      baselineMap: bodyBaselineMap,
      currentRollingMedians: bodyCurrentRollingMedians,
      chartHasEnoughData: bodyChartHasEnoughData,
      chartMarkers,
      flaggedClusters: bodyFlaggedClusters,
      dates,
      lineColor: BODY_COLOR,
      isLowerBetterFn: () => true,
    })}

    <div class="section-gap">
      <p class="section-label">Notable body events</p>
      ${eventTableHtml}
    </div>

    <div class="section-gap">
      <p class="section-label">Pain &amp; instability sites</p>
      ${siteListHtml}
    </div>

    ${buildEpisodeTimelineHtml({ clusters: bodyFlaggedClusters, chartMarkers, dates, interventionImpacts, showMarkerNumbers: true })}

    ${buildRareEventsSectionHtml(bodyRareEvents, bodyPatternEvolution)}

    <div class="explainer-box">
      <p class="explainer-title">Reading this page</p>
      <p class="explainer-text">Domain averages and active patterns are summarised on page 1.</p>
    </div>
  `;
}
