// Ported from the web app's src/utils/markerColors.ts, unchanged.

export const markerColors = {
  medication: '#f59e0b', // Amber
  therapy: '#14b8a6', // Teal
  life_event: '#a78bfa', // Purple
  cycle_phase: '#ec4899', // Deep pink (default / Day 1)
} as const;

export type MarkerType = keyof typeof markerColors;

export const markerTypeLabels: Record<MarkerType, string> = {
  medication: 'Medication',
  therapy: 'Appointment',
  life_event: 'Life event',
  cycle_phase: 'Cycle',
};

export function getMarkerColor(markerType: string): string {
  return markerColors[markerType as MarkerType] ?? '#6b7280';
}
