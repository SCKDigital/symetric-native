import { BODY_DOMAINS } from '@/lib/body/constants';
import { COMFORT_TOKENS } from '@/lib/comfort-theme';
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
// Ported from the web app's src/utils/domainColors.ts.

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

/** The body-domain accent (also reused as the app tint in theme.ts) and the
 *  neutral color used for mind-area labels/badges outside a check-in
 *  context. Ported from the web app's src/utils/domainColors.ts. */
export const BODY_COLOR = '#BC812F';
export const MIND_AREA_COLOR = '#e2e8f0';

/**
 * The one colour every domain takes in comfort mode.
 *
 * Not BRAND_COLOR, which is what the old simplified-colours toggle used. Comfort
 * mode drops the accents to COMFORT_TOKENS' quieter set, so painting every chip
 * and sparkline the full-strength brand indigo made the calm mode the loudest
 * one on some screens — thirteen bright chips where there had been a spread of
 * hues. Same value as COMFORT_TOKENS.accentText, for the same reason: muted is
 * the point.
 */
const COMFORT_DOMAIN_COLOR = COMFORT_TOKENS.accentText;

export function getDomainColor(domain: string, comfortMode = false): string {
  if (comfortMode) return COMFORT_DOMAIN_COLOR;
  const normalized = domain.toLowerCase().replace(/ /g, '_');
  if (normalized in BODY_DOMAINS) return BODY_COLOR;
  return DOMAIN_COLORS[normalized] ?? BRAND_COLOR;
}

/**
 * Comfort mode, read off a bare profile row rather than through useComfort().
 *
 * Same two ways in as the hook — the standing `comfort_mode` preference or an
 * unexpired `comfort_until` window — because the colour helpers are called from
 * plain functions and from components that already hold the profile, and
 * threading a hook through every one of them to answer "which palette" would be
 * a lot of wiring for one boolean. The cost is that an armed window expiring
 * mid-session only changes colours on the next render, where the hook's ticker
 * would have done it within thirty seconds; nothing here is time-critical.
 */
export function comfortActiveForProfile(profile: Profile | null | undefined): boolean {
  if (profile?.comfort_mode) return true;
  if (!profile?.comfort_until) return false;
  const endsAt = new Date(profile.comfort_until).getTime();
  return !Number.isNaN(endsAt) && endsAt > Date.now();
}

/**
 * Per-domain colour, unless comfort mode is on — then everything is one quiet
 * lavender.
 *
 * Simplified colours used to be its own Settings toggle sitting directly under
 * comfort mode, which is two switches for one need: someone reaching for
 * quieter colours is in the state comfort mode exists for, and having to find
 * and set both is the kind of small admin that state makes expensive. It is now
 * one of the things comfort mode does, and `profiles.simplified_colors` is no
 * longer read — the column stays for the web app until it makes the same move.
 */
export function getDomainColorFromProfile(domain: string, profile: Profile | null | undefined): string {
  return getDomainColor(domain, comfortActiveForProfile(profile));
}

/** Returns a heading label for one or more domains. Ported from the web
 *  app's src/utils/domainColors.ts, unchanged. */
export function domainHeadingLabel(domains: string[], domainLabels: Record<string, string>): string {
  if (domains.length === 0) return 'Pattern';
  if (domains.length === 1) return domainLabels[domains[0]] ?? domains[0];
  if (domains.length <= 3) return domains.map(d => domainLabels[d] ?? d).join(' + ');
  return `${domains.length} domains`;
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
