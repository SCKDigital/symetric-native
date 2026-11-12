import type { Appointment, AppointmentFocusCategory } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

// A past visit is recorded in one of two places:
//
// - an `appointments` row, set up ahead on Prepare and marked completed;
// - an "Appointment" event (`intervention_markers`, marker_type 'therapy'),
//   logged after the fact from Today's "+ Add an event".
//
// Prepare used to read only the first, so an appointment logged as an event
// was missing from the date range's appointment list. Both now go through
// here. When both exist for the same date, they are one visit:
// the appointment row wins (it carries focus areas and notes), and the
// event's Mind/Body is merged into its categories.

export interface PastVisit {
  key: string;
  date: string; // YYYY-MM-DD
  categories: AppointmentFocusCategory[];
  focusAreas: string[];
  notes: string | null;
  /** The event's own label, when the visit came from an event alone. */
  label: string | null;
}

/** "Mind", "Body", "Mind + Body", or null when the visit has neither. */
export function visitCategoryLabel(categories: PastVisit['categories']): string | null {
  const hasMind = categories.includes('mind');
  const hasBody = categories.includes('body');
  if (hasMind && hasBody) return 'Mind + Body';
  if (hasBody) return 'Body';
  if (hasMind) return 'Mind';
  return null;
}

/** What the visit was, when it says more than its Mind/Body pill does: an
 *  event's own label, else the appointment's focus areas. */
export function visitDescription(v: PastVisit): string | null {
  if (v.label && !/^(mind|body) appointment$/i.test(v.label.trim())) return v.label;
  if (v.focusAreas.length > 0) return v.focusAreas.join(', ');
  return null;
}

export function buildPastVisits(appointments: Appointment[], markers: InterventionMarker[]): PastVisit[] {
  const byDate = new Map<string, PastVisit>();

  for (const a of appointments) {
    if (!a.is_completed) continue;
    byDate.set(a.appointment_date, {
      key: `appt-${a.id}`,
      date: a.appointment_date,
      categories: [...(a.focus_categories ?? ['mind'])],
      focusAreas: a.focus_areas ?? [],
      notes: a.notes,
      label: null,
    });
  }

  for (const m of markers) {
    if (m.marker_type !== 'therapy') continue;
    const category: AppointmentFocusCategory | null =
      m.medication_action === 'body' ? 'body' : m.medication_action === 'mind' ? 'mind' : null;
    const existing = byDate.get(m.marker_date);
    if (existing) {
      if (category && !existing.categories.includes(category)) existing.categories.push(category);
      continue;
    }
    byDate.set(m.marker_date, {
      key: `marker-${m.id}`,
      date: m.marker_date,
      categories: category ? [category] : [],
      focusAreas: [],
      notes: null,
      label: m.label,
    });
  }

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}
