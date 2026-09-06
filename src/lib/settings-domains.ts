import { DomainType } from '@/lib/supabase';

// Port of the web app's src/components/settings/domainList.ts — the eight mind
// domains with the longer descriptions Settings uses when picking what to
// track. Distinct from DOMAIN_COPY in lib/domains.ts, which carries the short
// one-liners the check-in form shows.
export const ALL_DOMAINS: { type: DomainType; label: string; description: string }[] = [
  { type: 'mood', label: 'Mood', description: 'Your general emotional tone - how low or high your spirits feel' },
  { type: 'energy', label: 'Energy', description: 'Physical and mental activation - how depleted or energized you feel' },
  { type: 'anxiety', label: 'Anxiety', description: 'Tension, worry, or a sense of unease' },
  { type: 'concentration', label: 'Concentration', description: 'Your ability to focus and follow through on tasks' },
  { type: 'irritability', label: 'Irritability', description: 'Reactivity and on-edge feeling - how easily things bother you' },
  { type: 'social_battery', label: 'Social depletion', description: 'How drained or overwhelmed you feel by social interaction' },
  { type: 'sensory_sensitivity', label: 'Sensory overwhelm', description: 'How much sounds, lights, textures, or other sensory input is affecting you' },
  { type: 'motivation', label: 'Motivation', description: 'Drive and initiative to start or complete things' },
];

/** Below this the detectors have too little to correlate against — the web
 *  Settings enforces the same floor. */
export const MIN_DOMAINS = 2;
