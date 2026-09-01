// Ported from the web app's src/lib/report/theme.ts. The web version's
// values are @react-pdf/renderer style-object numbers (points); this port
// keeps the exact same numbers because CSS accepts a `pt` unit directly —
// the HTML this report renders (via expo-print) reuses these values
// verbatim with `pt` appended, so page layout stays pixel-for-pixel
// equivalent to the web report without re-deriving any of the spacing.

export const theme = {
  fonts: {
    body: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    boldItalic: 'Helvetica-BoldOblique',
  },
  colors: {
    text: '#1F2937',
    heading: '#1F2937',
    body: '#1F2937',
    muted: '#6B7280',
    faint: '#9CA3AF',
    border: '#D1D0C8',
    borderStrong: '#1F2937',
    subtle: '#F9FAFB',
    solid: '#1F2937',
    partial: '#6B7280',
    limited: '#9CA3AF',
    teal: '#0F6E56',
    tealBg: '#E1F5EE',
    coral: '#A32D2D',
    coralBg: '#FAECE7',
    amber: '#854F0B',
    amberBg: '#FAEEDA',
    gray: '#5F5E5A',
    markerAmber: '#0F6E56',
  },
  spacing: {
    // US Letter: 612 x 792 pt; 0.75in margins = 54pt
    page: { top: 48, right: 54, bottom: 60, left: 54 },
    sectionGap: 14,
    rowGap: 5,
  },
  fontSize: {
    patientName: 22,
    pageTitle: 10,
    sectionHeading: 9,
    body: 10,
    label: 9,
    small: 8,
    footer: 7,
  },
} as const;

export const CONTENT_WIDTH = 504;

export const DOMAIN_LABELS: Record<string, string> = {
  mood: 'Mood',
  energy: 'Energy',
  anxiety: 'Anxiety',
  concentration: 'Concentration',
  irritability: 'Irritability',
  social_battery: 'Social depletion',
  sensory_sensitivity: 'Sensory overwhelm',
  motivation: 'Motivation',
  sleep: 'Sleep quality',
};

export const MARKER_TYPE_LABELS: Record<string, string> = {
  medication: 'Medication',
  therapy: 'Therapy',
  life_event: 'Life event',
  cycle_phase: 'Cycle day 1',
};

export const LOWER_IS_BETTER = new Set(['anxiety', 'irritability', 'sensory_sensitivity']);
