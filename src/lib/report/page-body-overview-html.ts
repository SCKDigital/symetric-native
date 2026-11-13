import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { buildEpisodeTimelineSection, buildRareEventsSection } from '@/lib/report/page2-findings-html';
import { flowPages, textHeightPt, type FlowSection } from '@/lib/report/flow-pages';
import { BODY_MAP_HEIGHT_PT, buildBodyMapHtml } from '@/lib/report/body-map-svg';
import type { ChartMarker } from '@/lib/report/chart-coordinates';
import { BODY_EVENTS } from '@/lib/body/constants';
import { CONTENT_WIDTH, MARKER_TYPE_LABELS, theme } from '@/lib/report/theme';
import type { EventProximityResult } from '@/lib/detection/event-proximity';
import type { BodyEventOccurrence, BodySiteFrequency } from '@/lib/report/types';
import type { DetectedCluster } from '@/lib/supabase';
import { addDays } from '@/lib/date-utils';

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

/** A site first seen more than this many days into the range is flagged as
 *  having appeared during the period rather than run through it. */
const NEW_SITE_AFTER_DAYS = 14;

// Nothing on this page is capped any more. It used to show two events, three
// sites, two proximity rows and two rare events, each with "N not shown"
// beneath — this was the busiest page in the report. Every list now runs in
// full, at full width, onto continuation pages (see flow-pages.ts).

/**
 * Events counted either side of a medication or therapy change.
 *
 * The scored domains already get this treatment (intervention impact). The
 * events never have, though they are logged against the same dates — and
 * "has she been reacting to things since the new drug" is the question
 * actually asked about a medication in this population.
 */
function buildEventProximitySection(results: EventProximityResult[]): FlowSection {
  const rows = results.map(r => {
    const eventLabel = BODY_EVENTS[r.eventType as keyof typeof BODY_EVENTS]?.label ?? r.eventType;
    const markerLabel = r.markerLabel || (MARKER_TYPE_LABELS[r.markerType] ?? r.markerType);
    return {
      html: `<tr>
      <td>${esc(eventLabel)}</td>
      <td>${esc(markerLabel)}, ${esc(fmtDay(r.markerDate))}</td>
      <td class="center">${r.before}</td>
      <td class="center">${r.after}</td>
      <td class="center">${r.change > 0 ? '+' : ''}${r.change}</td>
    </tr>`,
      heightPt: textHeightPt(`${markerLabel}, ${fmtDay(r.markerDate)}`, theme.fontSize.small, 220) + 4,
    };
  });
  const note = 'Counts of logged events either side of the change, on the same 21-day window the domain comparison uses. Counts only - too few events to test, and nothing here establishes cause.';
  return {
    title: 'Events around a medication or therapy change',
    rows,
    open: {
      html: `<table class="domain-table">
      <thead><tr>
        <th>Event</th><th>Change</th>
        <th class="center">21 days before</th><th class="center">21 days after</th><th class="center">Difference</th>
      </tr></thead>
      <tbody>`,
      heightPt: 14,
    },
    close: '</tbody></table>',
    footer: { html: `<p class="empty-muted chart-note">${esc(note)}</p>`, heightPt: textHeightPt(note) + 10 },
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Ported from the web app's lib/report/sections/Page3BodyOverview.tsx
// ("Body Overview") — the body counterpart to Mind Overview: the same
// timeline and rare-events sections, plus two things body has and mind
// doesn't: a dated event table and a ranked site-frequency list for where
// pain/instability occurred. Returns one body per sheet.
export function buildBodyOverviewPages(data: BodyOverviewData): string[] {
  const {
    bodyEventOccurrences, bodySiteFrequency, bodyFlaggedClusters, chartMarkers, dates,
    interventionImpacts, bodyRareEvents, bodyPatternEvolution, sparklinesInline,
    dateFrom, eventProximity,
  } = data;
  const small = theme.fontSize.small;

  const eventsSection: FlowSection = {
    title: 'Notable body events',
    rows: bodyEventOccurrences.map(ev => {
      const detail = [ev.detail, ev.context].filter(Boolean).join(' · ') || '-';
      return {
        html: `
        <div class="event-table-row">
          <span class="event-col-date">${esc(fmtDay(ev.date))}</span>
          <span class="event-col-type">${esc(ev.label)}</span>
          <span class="event-col-detail">${esc(detail)}</span>
        </div>`,
        heightPt: Math.max(textHeightPt(detail, small, CONTENT_WIDTH - 186), textHeightPt(ev.label, small, 130)) + 7,
      };
    }),
    open: {
      html: `
      <div class="event-table-header-row">
        <span class="event-col-date-h">Date</span>
        <span class="event-col-type-h">Event</span>
        <span class="event-col-detail-h">Context</span>
      </div>`,
      heightPt: 14,
    },
    empty: { html: `<p class="empty-muted">No events logged in this period.</p>`, heightPt: 16 },
  };

  const sitesSection: FlowSection = {
    title: 'Pain & instability sites',
    rows: bodySiteFrequency.map(site => {
      // A site first reported well into the period is a joint recruited
      // during it, not one that has hurt throughout — the distinction a
      // ranked day-count erases, and the one that matters for a
      // hypermobility picture.
      const appearedLate = site.firstSeen > addDays(dateFrom, NEW_SITE_AFTER_DAYS);
      return {
        html: `
        <div class="site-row">
          <span class="site-label">${esc(site.label)}${appearedLate ? ' <strong>new</strong>' : ''}</span>
          <span class="site-dates">${esc(fmtDay(site.firstSeen))} to ${esc(fmtDay(site.lastSeen))}</span>
          <span class="site-count">${site.dayCount} day${site.dayCount !== 1 ? 's' : ''}</span>
        </div>`,
        heightPt: 18,
      };
    }),
    empty: { html: `<p class="empty-muted">No sites logged in this period.</p>`, heightPt: 16 },
  };

  // The app's "where it shows up" heatmap, front and back, above the list it
  // summarises. Absent when no site was logged; the list's own empty state
  // says so.
  const mapHtml = buildBodyMapHtml(bodySiteFrequency);
  const mapSection: FlowSection = {
    title: 'Where it shows up',
    rows: mapHtml ? [{ html: mapHtml, heightPt: BODY_MAP_HEIGHT_PT + 36 }] : [],
  };

  // Map first: it is the page's one picture, and placed after the event
  // table it was pushed to the next sheet, leaving half a page blank.
  return flowPages([
    mapSection,
    sitesSection,
    eventsSection,
    buildEpisodeTimelineSection({ clusters: bodyFlaggedClusters, chartMarkers, dates, interventionImpacts }),
    buildEventProximitySection(eventProximity),
    buildRareEventsSection(bodyRareEvents, bodyPatternEvolution),
  ], sparklinesInline ? { html: sparklinesInline, heightPt: 60 } : undefined);
}
