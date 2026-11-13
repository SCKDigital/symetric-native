import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { flowPages, type FlowSection } from '@/lib/report/flow-pages';
import { buildEpisodeTimelineSection, buildRareEventsSection } from '@/lib/report/page2-findings-html';
import type { ChartMarker } from '@/lib/report/chart-coordinates';
import type { DetectedCluster } from '@/lib/supabase';

interface Page2Data {
  chartMarkers: ChartMarker[];
  flaggedClusters: DetectedCluster[];
  dates: string[];
  interventionImpacts: InterventionImpact[];
  rareEvents: RareEvent[];
  patternEvolution: PatternEvolution[];
  /** The patient's own written notes for the period — see period-notes.ts.
   *  Null when nothing was written. */
  notesSection: FlowSection | null;
  /** Whatever layOutSparklines left for this page — in practice the "fewer
   *  than 7 days" note, since the charts themselves get their own pages. */
  sparklinesInline: string;
}

// Ported from the web app's Page2Patterns.tsx ("Mind Overview") — the body
// content only (no <html>/<style> wrapper, that's shared across every page
// by report-document.ts).
//
// Returns one body per sheet. The timeline, the rare events and the notes are
// shown in full, one after another at full width, and run onto continuation
// pages when there are more than a sheet holds — see flow-pages.ts.
export function buildPage2Pages(data: Page2Data): string[] {
  const {
    chartMarkers, flaggedClusters, dates, interventionImpacts,
    rareEvents, patternEvolution, sparklinesInline, notesSection,
  } = data;

  const sections: FlowSection[] = [
    buildEpisodeTimelineSection({ clusters: flaggedClusters, chartMarkers, dates, interventionImpacts }),
    buildRareEventsSection(rareEvents, patternEvolution),
    ...(notesSection ? [notesSection] : []),
  ];

  return flowPages(sections, sparklinesInline ? { html: sparklinesInline, heightPt: 60 } : undefined);
}

/** Follows the sparklines onto whichever page they end up on — see
 *  layOutSparklines. It explains the grey band and the trend wording those
 *  charts are drawn with, so it is worth nothing on a page without them. */
export const SPARKLINE_EXPLAINER_HTML = `
    <div class="explainer-box">
      <p class="explainer-title">Reading these charts</p>
      <p class="explainer-text">Grey = within personal baseline, not "fine" in an absolute sense: a score typical for this individual can still look high or low on a standard scale. The arrow beside each domain compares the median of its first days in the period with the median of its last, the figures printed beside it; numbered lines are the events in the timeline.</p>
    </div>`;
