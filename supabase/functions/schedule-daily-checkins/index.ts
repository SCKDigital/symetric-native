// supabase/functions/schedule-daily-checkins/index.ts
// Cron-triggered Edge Function — runs once daily (e.g. 00:05 local is impractical
// for multi-timezone users, so this runs every hour and is idempotent).
// Recommended cron: every hour, e.g. "0 * * * *"
//
// For each onboarded user whose active window starts within the next 60 minutes
// (in their local timezone), generate that day's check-ins if none exist yet.
//
// Required secrets (set via Supabase Dashboard → Settings → Edge Functions):
//   SUPABASE_URL              — injected automatically
//   SUPABASE_SERVICE_ROLE_KEY — injected automatically
//   CRON_SECRET               — set manually; must match the Authorization header
//                               sent by the pg_cron job.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types (mirrors src/lib/supabase.ts — kept minimal for what this fn needs)
// ---------------------------------------------------------------------------

interface Profile {
  id: string;
  timezone: string | null;
  onboarding_complete: boolean;
}

interface CheckInSettings {
  user_id: string;
  check_ins_per_day: number;
  window_start: string; // "HH:MM"
  window_end: string;   // "HH:MM"
}

// ---------------------------------------------------------------------------
// Scheduling logic (mirrors src/lib/scheduler.ts)
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 45 * 60 * 1000; // 45 minutes between check-ins

function parseWindowTime(dateStr: string, timeStr: string, tz: string): Date {
  // Build an absolute timestamp for HH:MM on a given YYYY-MM-DD in the user's tz.
  // We use the Intl trick: format epoch 0 in their tz to get the UTC offset, then
  // construct the wall-clock time directly.
  const [hh, mm] = timeStr.split(":").map(Number);
  // Create a Date representing midnight of dateStr in the user's timezone.
  // The cleanest portable approach: parse as UTC then shift by the tz offset.
  const midnightUTC = new Date(`${dateStr}T00:00:00Z`);
  // Get the UTC offset at that instant in the target tz (in minutes).
  const offset = getUTCOffsetMinutes(midnightUTC, tz);
  // Wall-clock midnight in user tz = UTC midnight minus offset
  const midnightLocal = new Date(midnightUTC.getTime() - offset * 60 * 1000);
  return new Date(midnightLocal.getTime() + (hh * 60 + mm) * 60 * 1000);
}

function getUTCOffsetMinutes(date: Date, tz: string): number {
  // Returns UTC offset in minutes for the given tz at the given instant.
  // e.g. Australia/Melbourne at +11 returns -660 (so that utc + offset_ms = local)
  // We use the difference between the UTC representation and the local representation.
  const utcStr = date.toLocaleString("en-GB", { timeZone: "UTC" });
  const localStr = date.toLocaleString("en-GB", { timeZone: tz });
  const parse = (s: string) => {
    // "dd/mm/yyyy, hh:mm:ss"
    const [datePart, timePart] = s.split(", ");
    const [d, mo, y] = datePart.split("/").map(Number);
    const [h, mi, se] = timePart.split(":").map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  };
  const utcDate = parse(utcStr);
  const localDate = parse(localStr);
  return (localDate.getTime() - utcDate.getTime()) / 60000;
}

function getLocalDateString(now: Date, tz: string): string {
  // Returns YYYY-MM-DD in the user's timezone.
  return now.toLocaleDateString("en-CA", { timeZone: tz }); // en-CA gives ISO date
}

/**
 * Divide the window into `count` equal bands and pick one random time within
 * each band. Mirrors generateBandedTimes in src/lib/scheduler.ts.
 */
function generateBandedTimes(startMs: number, endMs: number, count: number): number[] {
  if (count <= 0) return [];

  const totalMs = endMs - startMs;

  // Fallback for windows too narrow to fit all check-ins with minimum gap
  if (totalMs < MIN_GAP_MS * (count - 1)) {
    const step = Math.floor(totalMs / (count + 1));
    return Array.from({ length: count }, (_, i) => startMs + step * (i + 1));
  }

  const bandMs = totalMs / count;
  const times: number[] = [];

  for (let i = 0; i < count; i++) {
    const bandStartMs = startMs + i * bandMs;
    const bandEndMs = startMs + (i + 1) * bandMs;

    const prevMs = times.length > 0 ? times[times.length - 1] : -Infinity;
    const earliestMs = Math.max(bandStartMs, prevMs + MIN_GAP_MS);
    const remainingBands = count - i - 1;
    const latestMs = Math.min(bandEndMs, endMs - remainingBands * MIN_GAP_MS);

    if (earliestMs >= latestMs) {
      times.push(earliestMs);
    } else {
      times.push(earliestMs + Math.random() * (latestMs - earliestMs));
    }
  }

  return times;
}

/**
 * Calculate expiry time for a check-in based on the next check-in's scheduled
 * time. Mirrors calculateExpiryTime in src/lib/scheduler.ts.
 */
function calculateExpiryTime(currentMs: number, nextMs: number | null): number {
  const ninetyMinMs = 90 * 60 * 1000;

  if (nextMs === null) return currentMs + 3 * 60 * 60 * 1000;

  const gapMs = nextMs - currentMs;

  if (gapMs < ninetyMinMs) return currentMs + 30 * 60 * 1000;

  return Math.max(nextMs - ninetyMinMs, currentMs + 30 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Allow both cron (POST from pg_cron) and manual GET triggers
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Auth: require CRON_SECRET to match the Bearer token ──────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!cronSecret || !incomingToken || incomingToken !== cronSecret) {
    console.error("[schedule-daily-checkins] Unauthorized request rejected");
    return new Response("Unauthorized", { status: 401 });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const results: { userId: string; scheduled: number; skipped: string | null }[] = [];
  let errorCount = 0;

  try {
    // 1. Fetch all onboarded profiles with a timezone set
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, timezone, onboarding_complete")
      .eq("onboarding_complete", true)
      .not("timezone", "is", null);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ scheduled: 0, users: 0, message: "No onboarded users found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch check_in_settings for all these users in one query
    const userIds = (profiles as Profile[]).map((p) => p.id);
    const { data: allSettings, error: settingsError } = await adminClient
      .from("check_in_settings")
      .select("user_id, check_ins_per_day, window_start, window_end")
      .in("user_id", userIds);

    if (settingsError) throw settingsError;

    const settingsMap = new Map<string, CheckInSettings>(
      ((allSettings as CheckInSettings[]) ?? []).map((s) => [s.user_id, s])
    );

    // 3. For each user, determine their local date and whether we should schedule
    for (const profile of profiles as Profile[]) {
      const tz = profile.timezone ?? "UTC";
      const settings = settingsMap.get(profile.id);

      if (!settings) {
        results.push({ userId: profile.id, scheduled: 0, skipped: "no_settings" });
        continue;
      }

      const localDate = getLocalDateString(now, tz);

      // 4. Check if check-ins already exist for this user on their local date
      const { data: existing, error: existingError } = await adminClient
        .from("check_ins")
        .select("id")
        .eq("user_id", profile.id)
        .eq("scheduled_date", localDate)
        .limit(1);

      if (existingError) {
        console.error(`Error checking existing check-ins for ${profile.id}:`, existingError);
        errorCount++;
        continue;
      }

      if (existing && existing.length > 0) {
        results.push({ userId: profile.id, scheduled: 0, skipped: "already_scheduled" });
        continue;
      }

      // 5. Check if the window has already ended for today in their timezone
      const windowEnd = parseWindowTime(localDate, settings.window_end, tz);
      if (now >= windowEnd) {
        results.push({ userId: profile.id, scheduled: 0, skipped: "window_closed" });
        continue;
      }

      // 6. Determine effective window start (use now if window has already started)
      const windowStart = parseWindowTime(localDate, settings.window_start, tz);
      const effectiveStart = now > windowStart ? now : windowStart;

      // Ensure there's enough room for at least one check-in
      const remainingMs = windowEnd.getTime() - effectiveStart.getTime();
      if (remainingMs < 5 * 60 * 1000) {
        results.push({ userId: profile.id, scheduled: 0, skipped: "window_too_short" });
        continue;
      }

      // 7. Determine how many check-ins fit in the remaining window
      const maxFit = Math.floor(remainingMs / MIN_GAP_MS);
      const count = Math.max(1, Math.min(settings.check_ins_per_day, maxFit));

      // 8. Generate check-ins and insert directly (service role bypasses RLS).
      const timesMs = generateBandedTimes(
        effectiveStart.getTime(),
        windowEnd.getTime(),
        count
      );
      const rows = timesMs.map((t, index) => ({
        user_id: profile.id,
        scheduled_at: new Date(t).toISOString(),
        scheduled_date: localDate,
        expires_at: new Date(calculateExpiryTime(t, timesMs[index + 1] ?? null)).toISOString(),
        is_full_log: false,
        status: "pending",
      }));

      const { error: insertError } = await adminClient
        .from("check_ins")
        .insert(rows);

      if (insertError) {
        if (insertError.code === "23505") {
          results.push({ userId: profile.id, scheduled: 0, skipped: "already_scheduled" });
          continue;
        }
        console.error(`Insert error for user ${profile.id}:`, insertError);
        errorCount++;
        results.push({ userId: profile.id, scheduled: 0, skipped: "insert_error" });
        continue;
      }

      results.push({ userId: profile.id, scheduled: rows.length, skipped: null });
    }
  } catch (err) {
    console.error("Fatal error in schedule-daily-checkins:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const totalScheduled = results.reduce((sum, r) => sum + r.scheduled, 0);
  const scheduled = results.filter((r) => r.scheduled > 0).length;
  const skipped = results.filter((r) => r.skipped !== null).length;

  return new Response(
    JSON.stringify({
      ok: true,
      run_at: now.toISOString(),
      users_processed: results.length,
      users_scheduled: scheduled,
      users_skipped: skipped,
      check_ins_created: totalScheduled,
      errors: errorCount,
      detail: results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
