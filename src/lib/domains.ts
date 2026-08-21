import { DomainType } from '@/lib/supabase';

// Scoped port of what MindSetup needs from the web app's src/utils/domainUtils.ts
// (DOMAIN_ORDER, resolveActiveDomains) and src/content/copy.ts's checkIn.domains
// (labels/descriptions) — those live in much larger files on the web side
// covering unrelated screens; only the mind-domain subset is ported here.

export const DOMAIN_ORDER: DomainType[] = [
  'anxiety',
  'concentration',
  'energy',
  'irritability',
  'mood',
  'motivation',
  'sensory_sensitivity',
  'social_battery',
];

export const DOMAIN_COPY: Record<DomainType, { label: string; description: string }> = {
  mood: { label: 'Mood', description: 'Your overall emotional tone right now.' },
  energy: { label: 'Energy', description: 'How much fuel you feel you have.' },
  anxiety: { label: 'Anxiety', description: 'Tension, worry, or unease.' },
  concentration: { label: 'Concentration', description: 'How easy it is to focus.' },
  irritability: { label: 'Irritability', description: 'How on-edge or reactive you feel.' },
  social_battery: { label: 'Social depletion', description: 'How drained you feel by social interaction.' },
  sensory_sensitivity: { label: 'Sensory overwhelm', description: 'How much sensory input is affecting you.' },
  motivation: { label: 'Motivation', description: 'Drive and desire to do things.' },
};

/**
 * Results are returned in DOMAIN_ORDER for consistent display ordering.
 * If no settings domains are found, returns domainsWithData ?? [].
 */
export function resolveActiveDomains(
  settings: { active_domains?: DomainType[] | null; quick_checkin_domains?: DomainType[] | null } | null | undefined,
  domainsWithData?: DomainType[],
): DomainType[] {
  const settingsDomains: DomainType[] | null = settings?.active_domains?.length
    ? (settings.active_domains as DomainType[])
    : settings?.quick_checkin_domains?.length
      ? (settings.quick_checkin_domains as DomainType[])
      : null;

  if (settingsDomains) {
    if (domainsWithData) {
      return DOMAIN_ORDER.filter(d => settingsDomains.includes(d) || domainsWithData.includes(d));
    }
    return DOMAIN_ORDER.filter(d => settingsDomains.includes(d));
  }

  return domainsWithData ?? [];
}
