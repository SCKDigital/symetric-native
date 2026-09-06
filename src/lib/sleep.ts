// Sleep copy and scale, ported from the web app's `sleep` block in
// src/content/copy.ts. Native has no shared content module, so the strings
// live next to the one feature that uses them rather than in a new one.

export const SLEEP_COPY = {
  question: 'How did you sleep last night?',
  hoursLabel: 'Hours slept (optional)',
  hoursPlaceholder: 'e.g. 7.5',
  skipForToday: 'Skip for today',
  loggedLabel: 'Sleep · logged',
  skippedLabel: 'Skipped for today',
  card: {
    sectionLabel: 'Sleep',
    cta: "Log last night's sleep",
  },
  edit: {
    cta: 'Edit sleep log',
    minutesRemaining: (n: number) => `${n} min remaining`,
    cancel: 'Cancel',
  },
} as const;

/** Higher is better — 5 is "Very well". Anything reading this as a symptom
 *  score has it backwards; see lib/domain-polarity.ts. */
export const SLEEP_OPTIONS: { label: string; score: number; stars: number }[] = [
  { label: 'Very poor', score: 1, stars: 1 },
  { label: 'Poor', score: 2, stars: 2 },
  { label: 'Average', score: 3, stars: 3 },
  { label: 'Well', score: 4, stars: 4 },
  { label: 'Very well', score: 5, stars: 5 },
];

export function sleepScoreToMeta(score: number) {
  return SLEEP_OPTIONS.find(o => o.score === score) ?? { label: 'Logged', stars: 0 };
}
