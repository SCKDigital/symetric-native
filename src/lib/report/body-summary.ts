import { BODY_DOMAIN_ORDER, BODY_DOMAINS, BODY_EVENTS, MORNING_BODY_DOMAIN_ORDER, BODY_MAP_REGIONS, EVENT_SITE_LISTS } from '@/lib/body/constants';
import type { BodyEvent, BodyEventSite, BodyPainSite, BodySide } from '@/lib/supabase';
import type { BodyDomainSummary, BodyEventSummary, BodyEventOccurrence, BodySiteFrequency } from '@/lib/report/types';

// Ported from the web app's src/lib/report/bodySummary.ts, unchanged. Its own
// header comment about staying dependency-free of the PDF pipeline (so the
// web app's "Copy as text" path doesn't pay for the whole @react-pdf/renderer
// chunk) doesn't apply the same way on native — expo-print's HTML pipeline
// has no equivalent size cost — but the aggregation logic itself is
// unchanged, so it's kept as its own module rather than folded into a
// report page file.

/**
 * Pure aggregation over whatever body_checkins/body_events rows the caller
 * passed in — the caller decides what's in range and whether body inclusion
 * was requested at all. Both the evening value and, where it exists, the
 * morning value are folded into the same domain's distribution — they're two
 * readings of the same symptom on the same 0–10 scale, not different domains.
 */
export function computeBodySummaries(
  bodyCheckIns: any[],
  bodyEvents: any[],
): { domains: BodyDomainSummary[]; events: BodyEventSummary[]; daysLogged: number } {
  const morningCapable = new Set(MORNING_BODY_DOMAIN_ORDER);

  const domains: BodyDomainSummary[] = BODY_DOMAIN_ORDER.flatMap(domain => {
    const values: number[] = [];
    for (const entry of bodyCheckIns) {
      if (typeof entry[domain] === 'number') values.push(entry[domain]);
      if (morningCapable.has(domain) && typeof entry[`morning_${domain}`] === 'number') {
        values.push(entry[`morning_${domain}`]);
      }
    }
    if (values.length === 0) return [];
    return [{
      domain,
      label: BODY_DOMAINS[domain].label,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    }];
  });

  const eventCounts = new Map<string, number>();
  for (const ev of bodyEvents) {
    eventCounts.set(ev.event_type, (eventCounts.get(ev.event_type) ?? 0) + 1);
  }
  const events: BodyEventSummary[] = Array.from(eventCounts.entries()).map(([eventType, count]) => ({
    eventType,
    label: BODY_EVENTS[eventType as keyof typeof BODY_EVENTS]?.label ?? eventType,
    count,
  }));

  const daysLogged = new Set(bodyCheckIns.map(e => e.entry_date)).size;

  return { domains, events, daysLogged };
}

/**
 * Dated, per-occurrence body events (subluxation, presyncope, etc.) — the
 * report's "Notable body events" table needs actual dates, unlike
 * computeBodySummaries' aggregate counts. Context comes from the day's
 * free-text note (body_checkins.note — the "Anything else worth
 * remembering about today?" field), matched by date, not from the event's
 * own structured site/character data (which History's day-card still uses
 * for its own display, via formatEventLabel in format-body-event.ts).
 * Sorted most-recent-first, matching the web's EpisodeTimeline convention.
 */
export function buildBodyEventOccurrences(
  bodyEvents: BodyEvent[],
  bodyCheckIns: any[],
): BodyEventOccurrence[] {
  const noteByDate = new Map<string, string>();
  for (const c of bodyCheckIns) {
    if (c.note) noteByDate.set(c.entry_date, c.note);
  }
  return bodyEvents
    .map((ev): BodyEventOccurrence => ({
      date: ev.event_date,
      eventType: ev.event_type,
      label: BODY_EVENTS[ev.event_type]?.label ?? ev.event_type,
      context: noteByDate.get(ev.event_date),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Ranked site-frequency list for pain/instability location over the report
 * window — groups by (region, side), not further split by aspect/midline,
 * matching day-card's formatPainSites convention (front/back "shoulder" reads
 * as the same site). bodyPainSites needs its checkin's entry_date already
 * joined in by the caller, since body_pain_sites itself has no date column.
 */
export function computeBodySiteFrequency(
  bodyPainSites: (BodyPainSite & { entry_date: string })[],
  bodyEvents: (BodyEvent & { body_event_sites?: BodyEventSite[] })[],
): BodySiteFrequency[] {
  interface Entry { region: string; side: BodySide | null; days: Set<string>; sources: Set<'pain' | 'event'> }
  const byKey = new Map<string, Entry>();

  const bump = (region: string, side: BodySide | null, date: string, source: 'pain' | 'event') => {
    const key = `${region}|${side ?? ''}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { region, side, days: new Set(), sources: new Set() };
      byKey.set(key, entry);
    }
    entry.days.add(date);
    entry.sources.add(source);
  };

  for (const site of bodyPainSites) bump(site.region, site.side, site.entry_date, 'pain');
  for (const ev of bodyEvents) {
    for (const site of ev.body_event_sites ?? []) bump(site.region, site.side, ev.event_date, 'event');
  }

  // Region label — try the pain-site (BODY_MAP_REGIONS) vocabulary first,
  // falling back to the event-site lists for event-only regions (e.g.
  // "thumb"/"kneecap") that BODY_MAP_REGIONS doesn't cover.
  const painLabels = new Map<string, string>();
  for (const list of Object.values(BODY_MAP_REGIONS)) {
    for (const opt of list) painLabels.set(opt.region, opt.label);
  }
  const eventLabels = new Map<string, string>();
  for (const list of Object.values(EVENT_SITE_LISTS) as { region: string; label: string }[][]) {
    for (const opt of list) eventLabels.set(opt.region, opt.label);
  }

  return Array.from(byKey.values())
    .map(({ region, side, days, sources }): BodySiteFrequency => {
      const regionLabel = painLabels.get(region) ?? eventLabels.get(region) ?? region;
      const label = side ? `${side} ${regionLabel}` : regionLabel;
      const source: BodySiteFrequency['source'] =
        sources.size === 2 ? 'both' : (sources.has('pain') ? 'pain' : 'event');
      return { region, side, label, dayCount: days.size, source };
    })
    .sort((a, b) => b.dayCount - a.dayCount);
}
