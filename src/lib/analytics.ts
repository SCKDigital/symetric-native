import PostHog from 'posthog-react-native';

// Usage analytics through PostHog. The rule every function here keeps, and the
// one the privacy policy (§14) and the website's Your data page promise:
// PostHog learns how the app is used, never what someone logged or what the
// app found in it. So events carry counts, durations and which screen, and
// never a symptom, domain, body event type, medication, cycle or pattern.
// Several of the web app's events sent exactly those (body_event_logged's
// event_type, report_generated's medication/cycle flags); they're kept below
// as events with that detail removed. Adding a property? Ask whether it
// names something about the person's health. If it does, it doesn't go.
//
// On by default, with an opt-out in Settings (setAnalyticsEnabled). PostHog
// persists the opt-out on the device itself.
//
// Nothing is sent from the website demo (EXPO_PUBLIC_DEMO=1, the same flag
// as IS_DEMO on the web-demo branch), or when no key is set.

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
const isDemo = process.env.EXPO_PUBLIC_DEMO === '1';

const posthog: PostHog | null =
  !isDemo && key
    ? new PostHog(key, {
        host,
        // Screens and taps carry what's on them; neither is ever recorded.
        enableSessionReplay: false,
        errorTracking: { autocapture: false },
        // No city or country looked up from the IP: the privacy policy
        // promises the app never knows where someone is.
        disableGeoip: true,
        // Installed / updated / opened / backgrounded: usage, nothing more.
        captureAppLifecycleEvents: true,
      })
    : null;

function capture(event: string, properties?: Record<string, string | number | boolean>) {
  posthog?.capture(event, properties);
}

// ── Consent ─────────────────────────────────────────────────────────────────

export const analyticsAvailable = posthog !== null;

export async function isAnalyticsEnabled(): Promise<boolean> {
  if (!posthog) return false;
  await posthog.ready();
  return !posthog.optedOut;
}

export async function setAnalyticsEnabled(enabled: boolean) {
  if (!posthog) return;
  if (enabled) {
    await posthog.optIn();
  } else {
    // Send nothing more, and drop anything still queued.
    await posthog.optOut();
  }
}

// ── Identity ────────────────────────────────────────────────────────────────

// The Supabase user id only: no email, no profile properties.
export function identifyUser(userId: string) {
  posthog?.identify(userId);
}

export function resetUser() {
  posthog?.reset();
}

/** Route paths only (/insights, /prepare), never their contents. */
export function trackScreen(path: string) {
  posthog?.screen(path);
}

// ── Events ──────────────────────────────────────────────────────────────────

export const trackOnboardingStarted = () => capture('onboarding_started');
export const trackOnboardingStepCompleted = (step: number, stepName: string) =>
  capture('onboarding_step_completed', { step, step_name: stepName });
export const trackOnboardingAbandoned = (step: number, stepName: string) =>
  capture('onboarding_abandoned', { step, step_name: stepName });
// No domain_count: onboarding no longer picks domains; the setup cards on
// Today ask for them afterwards.
export const trackOnboardingCompleted = (durationSeconds: number) =>
  capture('onboarding_completed', { duration_seconds: durationSeconds });

export const trackCheckInCompleted = (domainCount: number) =>
  capture('check_in_completed', { domain_count: domainCount });
export const trackSleepLogged = () => capture('sleep_logged');

export const trackPrepareTabOpened = () => capture('prepare_tab_opened');
export const trackAppointmentCreated = (daysUntil: number) =>
  capture('appointment_created', { days_until: daysUntil });
// 'cycle_draft' would say the person tracks a cycle, so it's reported as 'auto'.
export const trackQuestionAdded = (source: 'manual' | 'auto' | 'cycle_draft') =>
  capture('question_added', { source: source === 'manual' ? 'manual' : 'auto' });
export const trackQuestionReordered = () => capture('question_reordered');
export const trackAppointmentCompleted = (questionCount: number, addressedCount: number) =>
  capture('appointment_completed', { question_count: questionCount, addressed_count: addressedCount });
export const trackPostAppointmentOutcomeCaptured = () => capture('post_appointment_outcome_captured');

// The medication and cycle flags in `opts` are deliberately not sent.
export const trackReportGenerated = (
  rangeDays: number,
  clusterCount: number,
  patternCount: number,
  opts?: { medicationPagePresent?: boolean; cycleSectionPresent?: boolean; patternCardsShown?: number; generationTimeMs?: number },
) =>
  capture('report_generated', {
    range_days: rangeDays,
    cluster_count: clusterCount,
    pattern_count: patternCount,
    ...(opts?.patternCardsShown !== undefined && { pattern_cards_shown: opts.patternCardsShown }),
    ...(opts?.generationTimeMs !== undefined && { generation_time_ms: opts.generationTimeMs }),
  });

export const trackBodyCheckInStarted = () => capture('body_checkin_started');
export const trackBodyCheckInCompleted = (domainCount: number, eventCount: number, retroactive: boolean) =>
  capture('body_checkin_completed', { domain_count: domainCount, event_count: eventCount, retroactive });
// Which event was logged is health information; only that one was.
export const trackBodyEventLogged = (_eventType: string) => capture('body_event_logged');
export const trackBodyBackfillUsed = (daysAgo: number) => capture('body_backfill_used', { days_ago: daysAgo });
export const trackBodySitePickerUsed = (_eventType: string) => capture('body_site_picker_used');
export const trackBodyMapOpened = () => capture('body_map_opened');
export const trackBodyMorningCheckInCompleted = (domainCount: number, retroactive: boolean) =>
  capture('body_morning_checkin_completed', { domain_count: domainCount, retroactive });
