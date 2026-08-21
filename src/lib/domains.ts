import { DomainType, Profile } from '@/lib/supabase';

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

// ── Colors ────────────────────────────────────────────────────────────────────
// Ported from the web app's src/utils/domainColors.ts. Body domain color
// resolution (BODY_COLOR / BODY_DOMAINS check) is omitted until body check-in
// is ported — falls back to BRAND_COLOR for anything not in DOMAIN_COLORS,
// same as the web version's own fallback.

export const DOMAIN_COLORS: Record<string, string> = {
  mood: '#818cf8',
  energy: '#34d399',
  anxiety: '#fb923c',
  concentration: '#38bdf8',
  irritability: '#f472b6',
  social_battery: '#a78bfa',
  sensory_sensitivity: '#fbbf24',
  motivation: '#c084fc',
  sleep: '#7B9EB8',
};

export const BRAND_COLOR = '#818CF8';

const SIMPLIFIED_COLOR = BRAND_COLOR;

export function getDomainColor(domain: string, simplifiedMode = false): string {
  if (simplifiedMode) return SIMPLIFIED_COLOR;
  const normalized = domain.toLowerCase().replace(/ /g, '_');
  return DOMAIN_COLORS[normalized] ?? BRAND_COLOR;
}

export function getDomainColorFromProfile(domain: string, profile: Profile | null | undefined): string {
  return getDomainColor(domain, profile?.simplified_colors ?? false);
}

// ── Slider anchor copy ───────────────────────────────────────────────────────

export const SLIDER_LABELS: Record<DomainType, { low: string; high: string }> = {
  mood: { low: 'Very low spirits', high: 'Very high spirits' },
  energy: { low: 'Completely drained', high: 'Fully energised' },
  anxiety: { low: 'Calm', high: 'Extremely tense' },
  concentration: { low: "Can't focus at all", high: 'Laser focused' },
  irritability: { low: 'Completely calm', high: 'Extremely on edge' },
  social_battery: { low: 'Fully recharged', high: 'Completely depleted' },
  sensory_sensitivity: { low: 'Not bothered', high: 'Overwhelmed' },
  motivation: { low: 'No drive at all', high: 'Fully motivated' },
};

// ── History/summary domain names ─────────────────────────────────────────────
// Ported from the web app's src/lib/dailySummary.ts. Deliberately a separate
// copy set from DOMAIN_COPY above, not a dedup — the web app itself uses
// different wording for the same domains in different contexts (onboarding's
// "Social depletion" vs History's "Social battery"), so collapsing them here
// would be a real behavior change, not a cleanup.

export const ALL_DOMAINS: DomainType[] = ['mood', 'energy', 'anxiety', 'concentration', 'irritability', 'social_battery', 'sensory_sensitivity', 'motivation'];

export const DOMAIN_NAMES: Record<DomainType, string> = {
  mood: 'Mood',
  energy: 'Energy',
  anxiety: 'Anxiety',
  concentration: 'Concentration',
  irritability: 'Irritability',
  social_battery: 'Social battery',
  sensory_sensitivity: 'Sensory sensitivity',
  motivation: 'Motivation',
};
