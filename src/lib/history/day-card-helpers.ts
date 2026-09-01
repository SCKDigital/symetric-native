// Direct port of the web app's src/lib/history/dayCardHelpers.ts, unchanged.

export type BodyColumnMode = 'off' | 'once' | 'twice';

/** Whether the BODY block renders at all, and whether it needs am/pm columns
 *  or a single value column — driven by the user's own settings
 *  (profiles.body_tracking_enabled / body_morning_enabled), not inferred
 *  from which values happen to be filled in on a given day. */
export function resolveBodyColumnMode(bodyTrackingEnabled: boolean, bodyMorningEnabled: boolean): BodyColumnMode {
  if (!bodyTrackingEnabled) return 'off';
  return bodyMorningEnabled ? 'twice' : 'once';
}
