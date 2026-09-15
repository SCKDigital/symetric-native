import { supabase } from '@/lib/supabase';
import { RESCUE_WINDOW_MS, CHECK_IN_EXPIRY_MINUTES } from '@/lib/constants';

// Ported from the web app's src/lib/scheduler.ts, unchanged — pure Date/Intl
// logic (no DOM/browser API involved), so it runs identically on native.

/**
 * Reads an instant's wall-clock fields in `timezone` and returns them as if
 * they were UTC. The difference between this and the instant itself is the
 * zone's offset at that instant.
 *
 * formatToParts, not toLocaleString: the *format* of toLocaleString's output is
 * implementation-defined and explicitly not something Date can parse back. V8
 * accepts its own "9/12/2026, 8:00:00 AM" output, which is why the previous
 * implementation worked on the web. Hermes' parser is far stricter, so on
 * device every offset came out NaN and every window boundary became an Invalid
 * Date. The damage was invisible: `now > windowEndUTC` is false for an Invalid
 * Date, so the "window has closed" guard did not bail out, and scheduling ran
 * on to throw RangeError inside its own try/catch and return having inserted
 * nothing. That is why a day's check-ins only ever appeared after opening the
 * web app. Reading numeric parts avoids the round-trip entirely.
 */
function wallClockAsUtcMs(instantMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Convert a local time string (HH:MM) on a given local date string (YYYY-MM-DD)
 * in the specified IANA timezone to a UTC Date.
 *
 * Works regardless of the device's own timezone: the answer is the instant
 * whose wall clock in `timezone` reads as the requested date and time.
 *
 * Solved by iteration rather than a single subtraction because the zone's
 * offset at the *guess* can differ from its offset at the *answer* — that is
 * exactly what happens across a DST boundary. Two passes converge for every
 * real zone; the second is a no-op whenever the first landed in the same
 * offset.
 */
export function localTimeToUTC(localDateStr: string, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const [year, month, day] = localDateStr.split('-').map(Number);
  const targetMs = Date.UTC(year, month - 1, day, hours, minutes, 0);

  let ms = targetMs;
  for (let i = 0; i < 2; i++) {
    ms += targetMs - wallClockAsUtcMs(ms, timezone);
  }
  return new Date(ms);
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

// Concurrent callers share one run. The existence check below is a
// read-then-write, and the times it generates are randomised inside their
// bands — so two calls racing each other both see "nothing scheduled yet",
// both generate a *different* set of times, and both inserts succeed. The
// unique constraint on (user_id, scheduled_date, scheduled_at) can't catch
// that, because the timestamps genuinely differ. The result is a user getting
// 8 check-ins on a 4-a-day setting.
//
// That race is easy to hit: the web app calls this from an App.tsx effect and
// from TodayScreen's, both firing on load, and the native hook used to call it
// on every refresh. Keyed by user + local date so a genuine day rollover still
// schedules.
const inFlightByUserDay = new Map<string, Promise<void>>();

export async function ensureTodayCheckIns(userId: string, timezone: string): Promise<void> {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const key = `${userId}:${dayKey}`;

  const existing = inFlightByUserDay.get(key);
  if (existing) return existing;

  const run = scheduleTodayCheckIns(userId, timezone).finally(() => {
    inFlightByUserDay.delete(key);
  });
  inFlightByUserDay.set(key, run);
  return run;
}

async function scheduleTodayCheckIns(userId: string, timezone: string) {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('check_in_settings')
      .select('check_ins_per_day, window_start, window_end')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings) {
      console.error('No check-in settings found:', settingsError);
      throw new Error('Could not read your check-in settings.');
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

    // An Invalid Date here used to sail straight past the "window has closed"
    // check below — every comparison against NaN is false — and only surfaced
    // three lines later as a RangeError from toISOString, caught by this
    // function's own try/catch and logged to a console nobody reads. Months of
    // days went unscheduled that way. Fail loudly and specifically instead.
    if (Number.isNaN(windowStartUTC.getTime()) || Number.isNaN(windowEndUTC.getTime())) {
      throw new Error(
        `Could not read the check-in window (${settings.window_start}–${settings.window_end}) `
        + `in timezone "${timezone}". Check the timezone on your profile.`,
      );
    }

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
      throw new Error("Could not save today's check-ins.");
    }

    console.log(`Scheduled ${rows.length} check-ins for ${todayLocal}`);
  } catch (error) {
    // Rethrown, not swallowed. Swallowing here is precisely how a broken
    // timezone conversion went unnoticed for months: the screen showed "your
    // check-ins are coming" forever and nothing anywhere said why. The caller
    // decides what the user sees; this only makes sure it knows.
    console.error('Error in ensureTodayCheckIns:', error);
    throw error;
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
