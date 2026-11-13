import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays, parseDateString, todayDateString } from '@/lib/date-utils';
import { visitCategoryLabel, visitDescription, type PastVisit } from '@/lib/past-visits';
import { IS_DEMO } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

// Scoped port of the date-range portion of the web app's PrepareScreen.tsx
// (DatePreset/PrepareRange types, defaultRangeForPreset, loadSavedRange,
// saveRange, weeksBetween — the rest of that file's state belongs to
// PrepareScreen itself). Mechanic swap: localStorage -> AsyncStorage, so
// load/save are async now (same throttle-key pattern as
// pattern-detection-scheduler.ts).

// 'since_visit' starts on whichever past appointment was picked, not
// necessarily the latest; range.start is that appointment's date.
export type DatePreset ='14' | '30' | '60' | '90' | 'since_visit' | 'since_marker' | 'custom';

export interface PrepareRange {
  preset: DatePreset;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

const prepareDateRangeKey = (userId: string) => `prepare_date_range_${userId}`;

// Inclusive of today, so "30 days" is 30 days. It used to start a day early:
// the 90-day pill printed a report reading "(91 days)".
export function defaultRangeForPreset(preset: '14' | '30' | '60' | '90', today = todayDateString()): PrepareRange {
  const days = parseInt(preset, 10);
  return { preset, start: addDays(today, -(days - 1)), end: today };
}

function isDayPreset(preset: DatePreset): preset is '14' | '30' | '60' | '90' {
  return preset === '14' || preset === '30' || preset === '60' || preset === '90';
}

export async function loadSavedRange(userId: string): Promise<PrepareRange> {
  const today = todayDateString();
  try {
    const raw = await AsyncStorage.getItem(prepareDateRangeKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as PrepareRange;
      // "Last 30 days" means the 30 days up to today, not up to whenever it
      // was picked, so a day preset is re-anchored rather than restored.
      if (isDayPreset(parsed.preset)) return defaultRangeForPreset(parsed.preset, today);
      if (parsed.end > today) parsed.end = today;
      if (parsed.start > parsed.end) parsed.start = addDays(parsed.end, -30);
      return parsed;
    }
  } catch {
    // ignore
  }
  // The website demo opens on the 90 days its sample report covers, where the
  // pattern she flagged for discussion is; it is older than 30 days.
  return defaultRangeForPreset(IS_DEMO ? '90' : '30', today);
}

export async function saveRange(userId: string, range: PrepareRange): Promise<void> {
  try {
    await AsyncStorage.setItem(prepareDateRangeKey(userId), JSON.stringify(range));
  } catch {
    // ignore
  }
}

function fmtLong(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * What the patient picked, in words, for the top of the report: "Since Mind
 * appointment on 8 August 2026", "Last 30 days". The dates alone don't say
 * why the report starts where it does, and a report generated "since the last
 * appointment" should say so to the person reading it at the next one.
 *
 * `visit` and `marker` are the appointment and event the range was started
 * from, when it was; either may be missing (a deleted appointment), and the
 * wording falls back to the date.
 */
export function describeRangeForReport(range: PrepareRange, context: { visit?: PastVisit | null; marker?: InterventionMarker | null } = {}): string {
  if (isDayPreset(range.preset)) return `Last ${range.preset} days`;
  if (range.preset === 'since_visit') {
    const visit = context.visit && context.visit.date === range.start ? context.visit : null;
    const kind = visit ? visitCategoryLabel(visit.categories) : null;
    const description = visit ? visitDescription(visit) : null;
    return `Since ${kind ? `${kind} ` : ''}appointment on ${fmtLong(range.start)}${description ? ` (${description})` : ''}`;
  }
  if (range.preset === 'since_marker') {
    const marker = context.marker && context.marker.marker_date === range.start ? context.marker : null;
    return marker ? `Since ${marker.label}, ${fmtLong(range.start)}` : `Since event on ${fmtLong(range.start)}`;
  }
  return 'Custom date range';
}

export function weeksBetween(start: string, end: string): number {
  const days = Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
  return Math.max(1, Math.round(days / 7));
}
