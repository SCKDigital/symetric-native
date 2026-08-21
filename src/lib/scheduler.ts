import { supabase } from '@/lib/supabase';
import { RESCUE_WINDOW_MS, CHECK_IN_EXPIRY_MINUTES } from '@/lib/constants';

// Ported from the web app's src/lib/scheduler.ts, unchanged — pure Date/Intl
// logic (no DOM/browser API involved), so it runs identically on native.

/**
 * Convert a local time string (HH:MM) on a given local date string (YYYY-MM-DD)
 * in the specified IANA timezone to a UTC Date.
 *
 * Works regardless of the device's own timezone because the offset is derived
 * by comparing how the same UTC instant is rendered in UTC vs the target timezone.
 */
export function localTimeToUTC(localDateStr: string, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const [year, month, day] = localDateStr.split('-').map(Number);

  // Treat the desired local time as UTC to get an approximate epoch value
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

  // Compare how `guess` renders in UTC vs the target timezone.
  // Parsing both strings in the same locale cancels the device's own offset,
  // giving us a clean UTC-vs-TZ delta.
  const utcMs = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const tzMs = new Date(guess.toLocaleString('en-US', { timeZone: timezone })).getTime();
  const offsetMs = utcMs - tzMs;

  return new Date(guess.getTime() + offsetMs);
}

/**
 * Returns the wall-clock hour/minute for an instant, as observed in the given
 * IANA timezone — the inverse of localTimeToUTC. Use this instead of
 * date.getHours()/getMinutes() whenever comparing against window_start/
 * window_end, which are configured in the user's profile timezone, not
 * necessarily the device's current timezone.
 */
export function timeOfDayInTZ(date: Date, timezone: string): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hours = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minutes = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return { hours, minutes };
}

export async function ensureTodayCheckIns(userId: string, timezone: string) {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('check_in_settings')
      .select('check_ins_per_day, window_start, window_end')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings) {
      console.error('No check-in settings found:', settingsError);
      return;
    }

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayLocal = formatter.format(now); // YYYY-MM-DD in user's timezone

    const { data: existingCheckIns, error: existingError } = await supabase
      .from('check_ins')
      .select('id')
      .eq('user_id', userId)
      .eq('scheduled_date', todayLocal);

    if (existingError) {
      // A query failure here must not silently fall through — that would insert
      // a duplicate set of check-ins every time the network hiccups.
      console.error('Error checking existing check-ins:', existingError);
      return;
    }

    if (existingCheckIns && existingCheckIns.length > 0) {
      console.log("Today's check-ins already exist");
      return;
    }

    // Compute window boundaries as correct UTC timestamps using the user's timezone.
    const windowStartUTC = localTimeToUTC(todayLocal, settings.window_start, timezone);
    const windowEndUTC = localTimeToUTC(todayLocal, settings.window_end, timezone);

    if (now > windowEndUTC) {
      console.log('Window has closed for today');
      return;
    }

    const effectiveStart = now > windowStartUTC ? now : windowStartUTC;

    const checkInTimes = generateBandedTimes(
      effectiveStart,
      windowEndUTC,
      settings.check_ins_per_day,
      45, // minimum gap in minutes
    );

    checkInTimes.sort((a, b) => a.getTime() - b.getTime());

    const rows = checkInTimes.map((time, index) => ({
      user_id: userId,
      scheduled_at: time.toISOString(),
      scheduled_date: todayLocal,
      expires_at: calculateExpiryTime(time, checkInTimes[index + 1] ?? null).toISOString(),
      status: 'pending',
    }));

    const { error: insertError } = await supabase.from('check_ins').insert(rows);

    if (insertError) {
      if (insertError.code === '23505') return; // another process already scheduled today
      console.error('Error scheduling check-ins:', insertError);
      return;
    }

    console.log(`Scheduled ${rows.length} check-ins for ${todayLocal}`);
  } catch (error) {
    console.error('Error in ensureTodayCheckIns:', error);
  }
}

/**
 * Calculate expiry time for a check-in based on the next check-in's scheduled time.
 * - If gap to next check-in < 90 min: expire at current + 30 min
 * - If gap >= 90 min: expire at next - 90 min, floored at current + 30 min
 * - No next check-in (last of day): expire at current + 3 hours
 */
function calculateExpiryTime(current: Date, next: Date | null): Date {
  const shortExpiryMs = CHECK_IN_EXPIRY_MINUTES * 60 * 1000;

  if (!next) return new Date(current.getTime() + 3 * 60 * 60 * 1000);

  const gapMs = next.getTime() - current.getTime();

  if (gapMs < RESCUE_WINDOW_MS) {
    return new Date(current.getTime() + shortExpiryMs);
  }

  return new Date(Math.max(next.getTime() - RESCUE_WINDOW_MS, current.getTime() + shortExpiryMs));
}

/**
 * Divide the window into `count` equal bands and pick one random time within
 * each band. This guarantees coverage across the full active window while
 * keeping times genuinely unpredictable.
 *
 * The 45-minute minimum gap is enforced as a guardrail: if a random pick
 * inside a band would violate it, the pick is clamped forward.
 */
function generateBandedTimes(start: Date, end: Date, count: number, minGapMinutes: number): Date[] {
  if (count <= 0) return [];

  const startMs = start.getTime();
  const endMs = end.getTime();
  const totalMs = endMs - startMs;
  const minGapMs = minGapMinutes * 60 * 1000;

  // Fallback for windows too narrow to fit all check-ins with minimum gap.
  // Schedule only as many check-ins as actually fit, still respecting the gap.
  if (totalMs < minGapMs * (count - 1)) {
    console.warn('Window too small for requested check-ins with minimum gap');
    const maxFit = Math.floor(totalMs / minGapMs) + 1;
    const fittable = Math.min(count, maxFit);
    if (fittable <= 1) return [new Date(startMs + Math.round(totalMs / 2))];
    const interval = totalMs / (fittable - 1);
    return Array.from({ length: fittable }, (_, i) => new Date(startMs + Math.round(interval * i)));
  }

  const bandMs = totalMs / count;
  const times: Date[] = [];

  for (let i = 0; i < count; i++) {
    const bandStartMs = startMs + i * bandMs;
    const bandEndMs = startMs + (i + 1) * bandMs;

    const prevMs = times.length > 0 ? times[times.length - 1].getTime() : -Infinity;
    const earliestMs = Math.max(bandStartMs, prevMs + minGapMs);

    const remainingBands = count - i - 1;
    const latestMs = Math.min(bandEndMs, endMs - remainingBands * minGapMs);

    if (earliestMs >= latestMs) {
      times.push(new Date(earliestMs));
    } else {
      times.push(new Date(earliestMs + Math.random() * (latestMs - earliestMs)));
    }
  }

  return times;
}
