import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import type { PatternEvolution } from '@/lib/detection/pattern-evolution';
import type { RareEvent } from '@/lib/detection/rare-events';
import { buildEpisodeTimelineHtml, buildRareEventsSectionHtml } from '@/lib/report/page2-findings-html';
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
   *  Empty string when nothing was written. */
  notesHtml: string;
  /** Whatever layOutSparklines left for this page — in practice the "fewer
   *  than 7 days" note, since the charts themselves now get their own pages
   *  rather than overflowing this one. */
  sparklinesInline: string;
}

// Ported from the web app's Page2Patterns.tsx ("Mind Overview") — the body
// content only (no <html>/<style> wrapper, that's shared across every page
// by report-document.ts). See that file's own header comment for the
// overall HTML-instead-of-component-tree approach this report uses.
export function buildPage2Html(data: Page2Data): string {
  const {
    chartMarkers, flaggedClusters, dates, interventionImpacts,
    rareEvents, patternEvolution, sparklinesInline, notesHtml,
  } = data;

  return `
    ${sparklinesInline}

    ${buildEpisodeTimelineHtml({ clusters: flaggedClusters, chartMarkers, dates, interventionImpacts, showMarkerNumbers: true })}

    ${buildRareEventsSectionHtml(rareEvents, patternEvolution)}

    ${notesHtml}
  `;
}

/** Follows the sparklines onto whichever page they end up on — see
 *  layOutSparklines. It explains the grey band those charts are drawn with,
 *  so it is worth nothing on a page that has no charts on it. */
export const SPARKLINE_EXPLAINER_HTML = `
    <div class="explainer-box">
      <p class="explainer-title">Reading these charts</p>
      <p class="explainer-text">Grey = within personal baseline, not "fine" in an absolute sense: a score typical for this individual can still look high or low on a standard scale.</p>
    </div>`;
