import type { BodyAspect, BodyDomainType, BodyEventType } from '@/lib/supabase';

// Direct port of the web app's src/lib/body/constants.ts — pure data/config,
// unchanged. Ported wholesale (including BODY_MAP_REGIONS/BodyMap-only bits
// not consumed until a later chunk) rather than trimmed to just what
// chunk 1 needs, same as this port's types-first precedent elsewhere.

export interface BodyDomainConfig {
  key: BodyDomainType;
  label: string;
  hint: string;
  lowAnchor: string | null;
  highAnchor: string;
  /** True for domains that must only appear in the evening check-in — filtered
   *  out of the morning form by this property, not a hardcoded list. */
  eveningOnly?: boolean;
  /** True for domains that can't be deactivated — excluded from the toggle
   *  list in BodyTrackingSheet and always included in the check-in form
   *  regardless of profiles.body_domains_active. */
  required?: boolean;
  /** True for domains no longer written to (currently only `pain`, split into
   *  pain_mechanical/pain_widespread — see PAIN_SPLIT_BOUNDARY_DATE below).
   *  Excluded from CHECKIN_BODY_DOMAIN_ORDER (the evening form and the
   *  Settings toggle list) but kept in BODY_DOMAIN_ORDER so History and
   *  detection keep reading pre-boundary rows exactly as before. */
  deprecated?: boolean;
}

/** Date the `pain` column was deprecated and split into `pain_mechanical`
 *  and `pain_widespread`. Pain data before this date is one combined number
 *  covering both; data from this date on lives in the two split columns.
 *  Any future detection work must treat pre- and post-boundary pain as
 *  separate series — never concatenate them into one, since mechanical and
 *  widespread pain often move in opposite directions, which is exactly the
 *  signal the split exists to preserve. */
export const PAIN_SPLIT_BOUNDARY_DATE = '2026-08-20';

// Fixed order — append new domains, never insert, so historical row ordering
// stays stable. `pain` stays in this list (deprecated, not removed) purely
// so History and detection keep iterating it for pre-boundary rows; it's
// filtered out of the check-in form and Settings toggle list via
// CHECKIN_BODY_DOMAIN_ORDER below. `exhaustion` is deliberately LAST despite
// being one of the earliest domains added — it's the "where you've landed,
// at the end of it" wrap-up question and reads oddly asked (or shown)
// anywhere but last. Nothing else in the codebase depends on array
// position, only on which domains are present, so this one repositioning
// is safe; still, don't reorder further without checking.
export const BODY_DOMAIN_ORDER: BodyDomainType[] = [
  'fatigue',
  'pain',
  'pain_mechanical',
  'pain_widespread',
  'joint_instability',
  'breathlessness',
  'orthostatic',
  'gut',
  'exhaustion',
];

export const BODY_DOMAINS: Record<BodyDomainType, BodyDomainConfig> = {
  fatigue: {
    key: 'fatigue',
    label: 'Fatigue across the day',
    hint: 'Taking the day as a whole, how heavy did your body feel?',
    lowAnchor: 'Light',
    highAnchor: 'Heavy all day',
  },
  pain: {
    key: 'pain',
    label: 'Pain',
    hint: 'One number for everything that hurt, wherever it was.',
    lowAnchor: null,
    highAnchor: 'Severe',
    deprecated: true,
  },
  pain_mechanical: {
    key: 'pain_mechanical',
    label: 'Joint & muscle pain',
    hint: 'Specific places you could point to.',
    lowAnchor: 'None',
    highAnchor: 'Severe',
  },
  pain_widespread: {
    key: 'pain_widespread',
    label: 'Widespread pain',
    hint: 'Aching or burning all over, skin sore to touch.',
    lowAnchor: 'None',
    highAnchor: 'Severe',
  },
  joint_instability: {
    key: 'joint_instability',
    label: 'Joint instability',
    hint: 'Looseness, giving way, holding yourself together.',
    lowAnchor: 'Steady',
    highAnchor: 'Unstable',
  },
  breathlessness: {
    key: 'breathlessness',
    label: 'Breathing',
    hint: 'Air hunger, breathless on effort, or a tight chest.',
    lowAnchor: 'Easy',
    highAnchor: 'Hard work',
  },
  orthostatic: {
    key: 'orthostatic',
    label: 'Standing up',
    hint: 'Lightheaded, heart racing, greying out on standing.',
    lowAnchor: 'Fine',
    highAnchor: 'Rough',
  },
  gut: {
    key: 'gut',
    label: 'Gut',
    hint: 'Nausea, bloating, cramping, motility.',
    lowAnchor: 'Settled',
    highAnchor: 'Bad',
  },
  exhaustion: {
    key: 'exhaustion',
    label: "Where you've landed",
    hint: 'Right now, this evening, at the end of it.',
    lowAnchor: 'Fine',
    highAnchor: 'Wrung out',
    eveningOnly: true,
    required: true,
  },
};

// The evening check-in form and the Settings per-domain toggle list both
// consume this — the full BODY_DOMAIN_ORDER minus deprecated domains, so
// `pain` never appears as editable again while History and detection (which
// use BODY_DOMAIN_ORDER directly) are unaffected.
export const CHECKIN_BODY_DOMAIN_ORDER: BodyDomainType[] = BODY_DOMAIN_ORDER.filter(
  d => !BODY_DOMAINS[d].deprecated
);

// The optional morning check-in is a fixed, separate three-question form —
// not user-configurable like the evening domain list, and not derived from
// body_domains_active. Filtered by !eveningOnly (defensively — none of these
// three are marked eveningOnly today, but a future domain added here must
// still be excluded if it is, per BodyDomainConfig.eveningOnly's contract).
export const MORNING_BODY_DOMAIN_ORDER: BodyDomainType[] = (
  ['fatigue', 'pain', 'orthostatic'] as BodyDomainType[]
).filter(d => !BODY_DOMAINS[d].eveningOnly);

/** Domains for which logging before the day is effectively over deserves a quiet inline hint. */
export const BODY_EARLY_LOG_SENSITIVE_DOMAINS: BodyDomainType[] = [];
export const BODY_EARLY_LOG_HOUR = 19; // local hour before which the early-log hint shows

// ── Character tags ───────────────────────────────────────────────────────────
//
// Descriptive context, like the body map — not scored, never a domain, never
// enters correlation/pattern logic. Persisted to body_checkins.pain_character
// / breathlessness_character. Validated here and at the write path rather
// than with a DB CHECK constraint, since this vocabulary is expected to
// change and a constraint would need a migration every time it does.
// Plain descriptions of sensation only — never label these as a screening
// tool, never group them under condition names, never surface an
// interpretation of what a combination might mean.

/** Shown when pain_mechanical or pain_widespread scores above 0 — one shared set for both. */
export const PAIN_CHARACTER_TAGS: string[] = [
  'aching',
  'burning',
  'electric or shooting',
  'pins and needles',
  'numbness',
  'skin sore to touch',
  'throbbing',
  'stiff',
];

/** Shown when breathlessness scores above 0. */
export const BREATHLESSNESS_CHARACTER_TAGS: string[] = [
  "can't get a full breath",
  'breathless on effort',
  'chest feels tight',
  'breathless when upright',
  'breathless at rest',
];

// ── Events ────────────────────────────────────────────────────────────────────
//
// Display order is fixed, matching the checklist order in BodyCheckIn.

export interface BodyEventConfig {
  key: BodyEventType;
  label: string;
  hint: string | null;
  sitePrompt: boolean; // only subluxation and injury prompt for a site
  /** True for event types that prompt for descriptive character tags instead of a site — currently only reaction. */
  characterPrompt?: boolean;
}

/** Shown when a 'reaction' event is ticked — same descriptive, non-scored intent as PAIN_CHARACTER_TAGS. */
export const REACTION_CHARACTER_TAGS: string[] = [
  'flushing',
  'hives',
  'sudden gut upset',
  'racing heart',
  'itching',
  'swelling',
];

export const BODY_EVENT_ORDER: BodyEventType[] = [
  'subluxation',
  'presyncope',
  'migraine_onset',
  'crash_onset',
  'reaction',
  'injury',
  'palpitations',
];

export const BODY_EVENTS: Record<BodyEventType, BodyEventConfig> = {
  subluxation: {
    key: 'subluxation',
    label: 'A joint went out',
    hint: 'Sublux or full dislocation',
    sitePrompt: true,
  },
  presyncope: {
    key: 'presyncope',
    label: 'Nearly fainted, or did',
    hint: null,
    sitePrompt: false,
  },
  migraine_onset: {
    key: 'migraine_onset',
    label: 'Migraine started',
    hint: 'Onset, not a continuing one',
    sitePrompt: false,
  },
  crash_onset: {
    key: 'crash_onset',
    label: 'A crash began',
    hint: 'Payback after exertion',
    sitePrompt: false,
  },
  reaction: {
    key: 'reaction',
    label: 'Reaction',
    hint: 'Flushing, hives, sudden gut',
    characterPrompt: true,
    sitePrompt: false,
  },
  injury: {
    key: 'injury',
    label: 'Injury or strain',
    hint: null,
    sitePrompt: true,
  },
  palpitations: {
    key: 'palpitations',
    label: 'Palpitations',
    hint: 'Heart racing, pounding, or skipping beats',
    sitePrompt: false,
  },
};

// ── Site lists ────────────────────────────────────────────────────────────────
//
// `region` is the exact string persisted to body_pain_sites.region / body_event_sites.region.
// `midline` regions never prompt for a side (side is stored as null).

export interface BodySiteOption {
  region: string;
  label: string;
  midline: boolean;
}

/** Sites offered by EventSitePicker when "subluxation" is ticked. */
export const SUBLUXATION_SITES: BodySiteOption[] = [
  { region: 'jaw', label: 'Jaw', midline: false },
  { region: 'neck', label: 'Neck', midline: true },
  { region: 'shoulder', label: 'Shoulder', midline: false },
  { region: 'elbow', label: 'Elbow', midline: false },
  { region: 'wrist', label: 'Wrist', midline: false },
  { region: 'fingers', label: 'Fingers', midline: false },
  { region: 'thumb', label: 'Thumb', midline: false },
  { region: 'ribs', label: 'Ribs', midline: true },
  { region: 'hip', label: 'Hip', midline: false },
  { region: 'kneecap', label: 'Kneecap', midline: false },
  { region: 'knee', label: 'Knee', midline: false },
  { region: 'ankle', label: 'Ankle', midline: false },
  { region: 'toes', label: 'Toes', midline: false },
];

/** Sites offered by EventSitePicker when "injury" is ticked. */
export const INJURY_SITES: BodySiteOption[] = [
  { region: 'neck', label: 'Neck', midline: true },
  { region: 'shoulder', label: 'Shoulder', midline: false },
  { region: 'upper_back', label: 'Upper back', midline: true },
  { region: 'elbow', label: 'Elbow', midline: false },
  { region: 'wrist', label: 'Wrist', midline: false },
  { region: 'hand', label: 'Hand', midline: false },
  { region: 'ribs', label: 'Ribs', midline: true },
  { region: 'low_back', label: 'Low back', midline: true },
  { region: 'hip', label: 'Hip', midline: false },
  { region: 'groin', label: 'Groin', midline: false },
  { region: 'hamstring', label: 'Hamstring', midline: false },
  { region: 'knee', label: 'Knee', midline: false },
  { region: 'calf', label: 'Calf', midline: false },
  { region: 'ankle', label: 'Ankle', midline: false },
  { region: 'foot', label: 'Foot', midline: false },
];

/** Only these two event types prompt for a site (see BodyEventConfig.sitePrompt). */
export const EVENT_SITE_LISTS: Partial<Record<BodyEventType, BodySiteOption[]>> = {
  subluxation: SUBLUXATION_SITES,
  injury: INJURY_SITES,
};

// ── Body map regions ─────────────────────────────────────────────────────────
//
// Used by BodyMap (hex tap targets, not ported until a later chunk) and its
// peer text-list mode. Region keys are persisted to body_pain_sites.region —
// they intentionally overlap with the event site region keys above where
// they refer to the same body part (e.g. 'shoulder', 'knee'), so the same
// region string means the same thing regardless of context.
//
// Laterality is anatomical, not visual: on the front view the viewer's left is the
// subject's right, and it flips on the back view. BodyMap is responsible for that
// mapping — this file only enumerates which regions exist per aspect.

export const BODY_MAP_REGIONS: Record<BodyAspect, BodySiteOption[]> = {
  front: [
    { region: 'jaw', label: 'Jaw', midline: false },
    { region: 'neck', label: 'Neck', midline: true },
    { region: 'shoulder', label: 'Shoulder', midline: false },
    { region: 'ribs', label: 'Ribs', midline: true },
    { region: 'elbow', label: 'Elbow', midline: false },
    { region: 'hip', label: 'Hip', midline: false },
    { region: 'wrist', label: 'Wrist', midline: false },
    { region: 'fingers', label: 'Fingers', midline: false },
    { region: 'knee', label: 'Knee', midline: false },
    { region: 'ankle', label: 'Ankle', midline: false },
  ],
  back: [
    { region: 'neck', label: 'Neck', midline: true },
    { region: 'shoulder', label: 'Shoulder', midline: false },
    { region: 'shoulder_blade', label: 'Shoulder blade', midline: false },
    { region: 'elbow', label: 'Elbow', midline: false },
    { region: 'low_back', label: 'Low back', midline: true },
    { region: 'si_joint', label: 'SI joint', midline: false },
    { region: 'wrist', label: 'Wrist', midline: false },
    { region: 'knee', label: 'Knee', midline: false },
    { region: 'ankle', label: 'Ankle', midline: false },
  ],
};

// Alpha ships without a sixth bottom-nav tab. Flip this to promote /body to a
// full tab later — see the web App.tsx's Screen union and nav render block;
// this port has no such switch yet since body has no tab presence at all.
export const BODY_TRACKING_AS_TAB = false;
