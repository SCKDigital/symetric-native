// Body events around an intervention.
//
// The report already asks what a medication change did to the scored domains
// (detection/intervention-impact.ts). It has never asked what happened to the
// discrete events — reactions, subluxations, near-faints, migraines — on the
// same timeline, even though both are logged against the same dates and sit
// three lines apart on the Body page.
//
// That gap is the shape of the question a clinician actually asks about a new
// drug in this population: not "did the fatigue score move" but "has she been
// reacting to things since". Counting events either side of the marker is a
// crude instrument, and it is deliberately reported as counts rather than a
// rate or a test — a handful of events over a few weeks cannot support
// anything stronger, and pretending otherwise is how a tracker starts making
// claims a clinician has to unpick.

export interface ProximityInputEvent {
  event_date: string;
  event_type: string;
}

export interface ProximityInputMarker {
  marker_date: string;
  marker_type: string;
  label?: string | null;
}

export interface EventProximityResult {
  markerDate: string;
  markerType: string;
  markerLabel: string;
  eventType: string;
  before: number;
  after: number;
  /** after - before. Positive means more of this event since. */
  change: number;
  windowDays: number;
}

/** Matches intervention-impact's own window, so the two sections on the page
 *  are describing the same stretch of time. */
export const PROXIMITY_WINDOW_DAYS = 21;

/** A one-off either side is noise. Something has to happen at least three
 *  times across the two windows before it is worth a line in a report. */
const MIN_TOTAL_EVENTS = 3;
/** And the two sides have to actually differ. */
const MIN_CHANGE = 2;

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Counts each event type in the window before and after each medication or
 * therapy marker, returning only the pairings where the count actually moved.
 *
 * Life events and cycle markers are skipped: the question this answers is
 * what an intervention was followed by, and a cycle day is not an
 * intervention. Strongest change first.
 */
export function detectEventProximity(
  events: ProximityInputEvent[],
  markers: ProximityInputMarker[],
  windowDays: number = PROXIMITY_WINDOW_DAYS,
): EventProximityResult[] {
  const interventions = markers.filter(m => m.marker_type === 'medication' || m.marker_type === 'therapy');
  if (interventions.length === 0 || events.length === 0) return [];

  const eventTypes = [...new Set(events.map(e => e.event_type))];
  const results: EventProximityResult[] = [];

  for (const marker of interventions) {
    const windowStart = addDays(marker.marker_date, -windowDays);
    const windowEnd = addDays(marker.marker_date, windowDays);

    for (const eventType of eventTypes) {
      const ofType = events.filter(e => e.event_type === eventType);
      // The marker day itself counts as "after": a dose taken that morning
      // can be followed by a reaction the same afternoon.
      const before = ofType.filter(e => e.event_date >= windowStart && e.event_date < marker.marker_date).length;
      const after = ofType.filter(e => e.event_date >= marker.marker_date && e.event_date <= windowEnd).length;

      if (before + after < MIN_TOTAL_EVENTS) continue;
      if (Math.abs(after - before) < MIN_CHANGE) continue;

      results.push({
        markerDate: marker.marker_date,
        markerType: marker.marker_type,
        markerLabel: marker.label ?? '',
        eventType,
        before,
        after,
        change: after - before,
        windowDays,
      });
    }
  }

  return results.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}
