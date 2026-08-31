// Ported from the web app's src/types/marker.ts, unchanged.

export type MedicationAction = 'start' | 'stop' | 'increase' | 'decrease' | 'other' | 'day_one' | 'mind' | 'body';

export interface InterventionMarker {
  id: string;
  user_id: string;
  marker_date: string; // YYYY-MM-DD
  label: string;
  marker_type: 'medication' | 'therapy' | 'life_event' | 'cycle_phase';
  medication_action?: MedicationAction; // Only set for medication markers
  created_at: string;
  updated_at: string;
}

export interface CreateMarkerInput {
  marker_date: string;
  label: string;
  marker_type: 'medication' | 'therapy' | 'life_event' | 'cycle_phase';
  medication_action?: MedicationAction;
}

export interface UpdateMarkerInput {
  id: string;
  marker_date?: string;
  label?: string;
  marker_type?: 'medication' | 'therapy' | 'life_event' | 'cycle_phase';
  medication_action?: MedicationAction;
}
