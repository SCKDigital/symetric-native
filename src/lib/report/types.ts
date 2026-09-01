// Scoped port of the web app's src/lib/report/types.ts — just the four body
// summary/aggregation shapes bodySummary.ts and BodyAreaDetail need. The web
// file's much larger SymetricReportData interface (and everything else in
// it) is NOT ported — nothing on native builds a full report data object
// yet; each report page function takes its own narrow props instead (see
// generate-report.ts).

export interface BodyDomainSummary {
  domain: string;
  label: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface BodyEventSummary {
  eventType: string;
  label: string;
  count: number;
}

export interface BodyEventOccurrence {
  date: string;
  eventType: string;
  label: string;
  context?: string;
}

/** Ranked site-frequency data — {region, side, dayCount} is deliberately the
 *  exact shape a future body-map visual would consume; no rework needed if
 *  that gets built later, just a new renderer over the same field. */
export interface BodySiteFrequency {
  region: string;
  side: string | null;
  label: string;
  dayCount: number;
  source: 'pain' | 'event' | 'both';
}
