// Stub — the web app's src/lib/analytics.ts wires ~30 tracked events through
// posthog-js. Porting that wholesale is separate work (posthog-react-native,
// a different init/autocapture story on native); this only covers the two
// calls AuthContext needs so auth isn't blocked on that decision.
// TODO: wire up posthog-react-native and port the full event set.

export function identifyUser(_userId: string) {
  // no-op until posthog-react-native is wired in
}

export function resetUser() {
  // no-op until posthog-react-native is wired in
}

export function trackOnboardingStarted() {}
export function trackOnboardingStepCompleted(_step: number, _stepName: string) {}
export function trackOnboardingAbandoned(_step: number, _stepName: string) {}
export function trackOnboardingCompleted(_durationSeconds: number, _domainCount: number) {}
export function trackCheckInCompleted(_domainCount: number) {}
export function trackPrepareTabOpened() {}
export function trackAppointmentCreated(_daysUntil: number) {}
export function trackPatternMarkedForDiscussion() {}
export function trackPatternNoteAdded() {}
export function trackQuestionAdded(_source: 'manual' | 'auto' | 'cycle_draft') {}
export function trackQuestionReordered() {}
export function trackAppointmentCompleted(_questionCount: number, _addressedCount: number) {}
export function trackPostAppointmentOutcomeCaptured() {}
export function trackReportGenerated(
  _rangeDays: number,
  _clusterCount: number,
  _patternCount: number,
  _opts?: { medicationPagePresent?: boolean; cycleSectionPresent?: boolean; patternCardsShown?: number; generationTimeMs?: number }
) {}
export function trackBodyCheckInStarted() {}
export function trackBodyCheckInCompleted(_domainCount: number, _eventCount: number, _retroactive: boolean) {}
export function trackBodyEventLogged(_eventType: string) {}
export function trackBodyBackfillUsed(_daysAgo: number) {}
export function trackBodySitePickerUsed(_eventType: string) {}
export function trackBodyMapOpened() {}
export function trackBodyMorningCheckInCompleted(_domainCount: number, _retroactive: boolean) {}
