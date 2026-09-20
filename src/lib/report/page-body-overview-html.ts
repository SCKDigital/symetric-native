import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { buildEpisodeTimelineHtml, buildRareEventsSectionHtml } from '@/lib/report/page2-findings-html';
import type { ChartMarker } from '@/lib/report/chart-coordinates';
import { BODY_EVENTS } from '@/lib/body/constants';
import { MARKER_TYPE_LABELS } from '@/lib/report/theme';
import type { EventProximityResult } from '@/lib/detection/event-proximity';
import type { BodyEventOccurrence, BodySiteFrequency } from '@/lib/report/types';
import type { DetectedCluster } from '@/lib/supabase';

interface BodyOverviewData {
  bodyEventOccurrences: BodyEventOccurrence[];
  bodySiteFrequency: BodySiteFrequency[];
  bodyFlaggedClusters: DetectedCluster[];
  chartMarkers: ChartMarker[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
  bodyRareEvents: RareEvent[];
  bodyPatternEvolution: PatternEvolution[];
  /** Start of the report range, for marking sites that appeared part-way
   *  through it rather than running all period. */
  dateFrom: string;
  /** Body events counted either side of each medication or therapy marker. */
  eventProximity: EventProximityResult[];
  /** Whatever layOutSparklines left for this page — see page2-html's own
   *  field of the same name. The body charts now get their own pages too:
   *  this page was the busier of the two, carrying eight possible severity
   *  charts plus an event table, a site list, a timeline and rare events. */
  sparklinesInline: string;
}

// Capped the same way EpisodeTimeline/RareEventsSection are, for the same
// overflow reason (the web app's Page3BodyOverview.tsx carries a KNOWN GAP
// comment about this being the busiest page in the report). The unbounded
// part of that gap — the sparklines, which grew with the number of tracked
// domains and had no cap at all — is handled now: they are paginated onto
// their own pages by layOutSparklines. These two caps stay, because a table
// of every event ever logged is a different problem from a chart per domain.
const BODY_EVENT_MAX_ENTRIES = 2;
const SITE_MAX_ENTRIES = 3;
/** A site first seen more than this many days into the range is flagged as
 *  having appeared during the period rather than run through it. */
const NEW_SITE_AFTER_DAYS = 14;
/** This page carries more sections than any other — an event table, a site
 *  list, intervention proximity, a timeline and rare events — so it gets a
 *  tighter rare-event cap than Mind Overview. Every list says what it is not
 *  showing. */
const BODY_RARE_MAX_ENTRIES = 2;
/** Capped for the same page-budget reason as the event and site lists above —
 *  the measured layout check puts this page closest to its sheet. */
const PROXIMITY_MAX_ENTRIES = 2;

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Events counted either side of a medication or therapy change.
 *
 * The scored domains already get this treatment (intervention impact). The
 * events never have, though they are logged against the same dates — and
 * "has she been reacting to things since the new drug" is the question
 * actually asked about a medication in this population.
 */
function buildEventProximityHtml(results: EventProximityResult[]): string {
  if (results.length === 0) return '';
  const rows = results.slice(0, PROXIMITY_MAX_ENTRIES).map(r => {
    const eventLabel = BODY_EVENTS[r.eventType as keyof typeof BODY_EVENTS]?.label ?? r.eventType;
    const markerLabel = r.markerLabel || (MARKER_TYPE_LABELS[r.markerType] ?? r.markerType);
    return `<tr>
      <td>${esc(eventLabel)}</td>
      <td>${esc(markerLabel)}, ${esc(fmtDay(r.markerDate))}</td>
      <td class="center">${r.before}</td>
      <td class="center">${r.after}</td>
      <td class="center">${r.change > 0 ? '+' : ''}${r.change}</td>
    </tr>`;
  }).join('');

  return `<div class="section-gap">
    <p class="section-label">Events around a medication or therapy change</p>
    <table class="domain-table">
      <thead><tr>
        <th>Event</th><th>Change</th>
        <th class="center">21 days before</th><th class="center">21 days after</th><th class="center">Difference</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="empty-muted chart-note">Counts of logged events either side of the change, on the same 21-day window the domain comparison uses. Counts only - too few events to test, and nothing here establishes cause.</p>
  </div>`;
}

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
    bodyEventOccurrences, bodySiteFrequency, bodyFlaggedClusters, chartMarkers, dates,
    interventionImpacts, bodyRareEvents, bodyPatternEvolution, sparklinesInline,
    dateFrom, eventProximity,
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
          <span class="event-col-detail">${esc([ev.detail, ev.context].filter(Boolean).join(' · ') || '-')}</span>
        </div>`).join('')}
      ${olderEventCount > 0 ? `<p class="overflow-note">${olderEventCount} earlier event${olderEventCount !== 1 ? 's' : ''} not shown.</p>` : ''}
    `;

  const siteListHtml = shownSites.length === 0
    ? `<p class="empty-muted">No sites logged in this period.</p>`
    : `
      ${shownSites.map(site => {
        // A site first reported well into the period is a joint recruited
        // during it, not one that has hurt throughout — the distinction a
        // ranked day-count erases, and the one that matters for a
        // hypermobility picture.
        const appearedLate = site.firstSeen > addDays(dateFrom, NEW_SITE_AFTER_DAYS);
        return `
        <div class="site-row">
          <span class="site-label">${esc(site.label)}${appearedLate ? ' <strong>new</strong>' : ''}</span>
          <span class="site-dates">${esc(fmtDay(site.firstSeen))} to ${esc(fmtDay(site.lastSeen))}</span>
          <span class="site-count">${site.dayCount} day${site.dayCount !== 1 ? 's' : ''}</span>
        </div>`;
      }).join('')}
      ${olderSiteCount > 0 ? `<p class="overflow-note">${olderSiteCount} more region${olderSiteCount !== 1 ? 's' : ''} not shown.</p>` : ''}
    `;

  return `
    ${sparklinesInline}

    <div class="section-gap">
      <p class="section-label">Notable body events</p>
      ${eventTableHtml}
    </div>

    <div class="section-gap">
      <p class="section-label">Pain &amp; instability sites</p>
      ${siteListHtml}
    </div>

    ${buildEpisodeTimelineHtml({ clusters: bodyFlaggedClusters, chartMarkers, dates, interventionImpacts, showMarkerNumbers: true })}

    ${buildEventProximityHtml(eventProximity)}

    ${buildRareEventsSectionHtml(bodyRareEvents, bodyPatternEvolution, BODY_RARE_MAX_ENTRIES)}
  `;
}
