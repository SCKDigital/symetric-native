// Direct port of the web app's src/lib/body/formatBodyEvent.ts, unchanged —
// shared region/site label formatting used by History's DayCard (in-app)
// and, once ported, the PDF report's body event table / site-frequency
// list, so the two surfaces never drift apart in how they describe a
// logged site or event.

import { BODY_EVENTS, EVENT_SITE_LISTS, BODY_MAP_REGIONS, type BodySiteOption } from '@/lib/body/constants';
import type { BodyAspect, BodyEvent, BodyEventSite, BodyEventType, BodyPainSite, BodySide } from '@/lib/supabase';

function formatRegionLabel(region: string, side: BodySide | null, options: BodySiteOption[]): string {
  const label = options.find(o => o.region === region)?.label ?? region;
  return side ? `${side} ${label}` : label;
}

/** "R Shoulder, Neck" style label for a set of pain/instability sites. */
export function formatPainSiteLabel(sites: BodyPainSite[]): string | undefined {
  if (!sites.length) return undefined;
  return sites.map(s => formatRegionLabel(s.region, s.side, BODY_MAP_REGIONS[s.aspect as BodyAspect])).join(', ');
}

/** "R Shoulder" style label for a subluxation/injury event's site(s), or
 *  undefined when the event type has no site prompt / none were logged. */
export function formatEventSiteLabel(eventType: BodyEventType, sites: BodyEventSite[]): string | undefined {
  if (!sites.length) return undefined;
  const options = EVENT_SITE_LISTS[eventType] ?? [];
  return sites.map(s => formatRegionLabel(s.region, s.side, options)).join(', ');
}

/** "flushing, hives" style label for a reaction event's character tags. */
export function formatEventCharacterLabel(character: string[] | null | undefined): string | undefined {
  return character?.length ? character.join(', ') : undefined;
}

/** "<event label>: <context>" — context is the site(s) for subluxation/injury
 *  or the descriptive character tags for reaction; bare label otherwise. */
export function formatEventLabel(event: BodyEvent & { body_event_sites?: BodyEventSite[] }): string {
  const label = BODY_EVENTS[event.event_type].label;
  const context = formatEventSiteLabel(event.event_type, event.body_event_sites ?? []) ?? formatEventCharacterLabel(event.character);
  return context ? `${label}: ${context}` : label;
}
