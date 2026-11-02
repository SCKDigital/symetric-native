import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays, todayDateString } from '@/lib/date-utils';
import { IS_DEMO } from '@/lib/supabase';

// Scoped port of the date-range portion of the web app's PrepareScreen.tsx
// (DatePreset/PrepareRange types, defaultRangeForPreset, loadSavedRange,
// saveRange, weeksBetween — the rest of that file's state belongs to
// PrepareScreen itself). Mechanic swap: localStorage -> AsyncStorage, so
// load/save are async now (same throttle-key pattern as
// pattern-detection-scheduler.ts).

export type DatePreset = '14' | '30' | '60' | '90' | 'since_visit' | 'since_marker' | 'custom';

export interface PrepareRange {
  preset: DatePreset;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

const prepareDateRangeKey = (userId: string) => `prepare_date_range_${userId}`;

export function defaultRangeForPreset(preset: '14' | '30' | '60' | '90', today = todayDateString()): PrepareRange {
  const days = parseInt(preset, 10);
  return { preset, start: addDays(today, -days), end: today };
}

export async function loadSavedRange(userId: string): Promise<PrepareRange> {
  const today = todayDateString();
  try {
    const raw = await AsyncStorage.getItem(prepareDateRangeKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as PrepareRange;
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

export function weeksBetween(start: string, end: string): number {
  const days = Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
  return Math.max(1, Math.round(days / 7));
}
