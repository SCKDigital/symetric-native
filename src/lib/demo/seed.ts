// The demo's starting data: one invented person, already through onboarding
// and every Today setup card, so a visitor lands straight on Today, with eight
// weeks of history behind them.
//
// Everything is dated relative to the moment the demo opens, so the history
// always ends "today" whenever someone visits the site.
//
// Only raw entries are seeded — check-ins, sleep, body check-ins, markers.
// Pattern detection runs in the app (pattern-detection-scheduler.ts), so the
// clusters and connections Insights shows are the real detectors' output on
// this data, not hand-written results. The story is shaped so they have
// something to find, all inside Insights' default 30-day window:
//
//   ~4 weeks ago   steady, near baseline — what the baselines come from
//   27 days ago    life event: moved house
//   25 → 15 ago    a low patch: mood, energy and concentration down, anxiety
//                  up, sleep poor, fatigue and brain fog up
//   17 days ago    medication marker: started a new medication
//   15 → today     a gradual recovery
//   9 days ago     therapy marker: started CBT
//
// Underneath all of it: energy and fatigue follow the previous night's
// sleep, mood and energy move together, and energy dips in the afternoon.
// A seeded PRNG keeps the numbers identical on every visit.

import type { User } from '@supabase/supabase-js';

import type { DomainType } from '@/lib/supabase';

const USER_ID = '00000000-0000-4000-8000-000000000001';

export const DEMO_USER = {
  id: USER_ID,
  email: 'demo@symetric.app',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as User;

const ACTIVE_DOMAINS: DomainType[] = ['mood', 'energy', 'anxiety', 'concentration'];

function localDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function atLocal(day: Date, hours: number, minutes = 0) {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function daysAgo(now: Date, n: number) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

/** mulberry32 — small, fast, and the same sequence for the same seed. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 1, hi = 10) => Math.min(hi, Math.max(lo, Math.round(v)));

const HISTORY_DAYS = 56;

/** How far into the low patch a day is: 0 outside it, rising to 1 at its
 *  worst, then easing back to 0 over the fortnight of recovery. */
function lowness(ago: number) {
  if (ago > 25) return 0;
  if (ago >= 21) return (26 - ago) / 5; // sliding in
  if (ago >= 15) return 1; // the worst of it
  return Math.max(0, (ago - 1) / 14) ** 1.5; // recovering
}

const NOTES: Record<number, string> = {
  27: 'Moving day. Exhausted.',
  24: 'Can’t settle in the new place',
  22: 'Called in sick',
  19: 'Slept maybe 4 hours',
  17: 'GP appointment, starting something new',
  12: 'Bit more like myself today',
  9: 'First CBT session',
  4: 'Long walk, felt lighter',
};

function buildHistory(now: Date) {
  const rand = prng(20261102);
  const jitter = (spread: number) => (rand() - 0.5) * 2 * spread;

  const checkIns: Record<string, any>[] = [];
  const sleepLogs: Record<string, any>[] = [];
  const bodyCheckIns: Record<string, any>[] = [];
  const painSites: Record<string, any>[] = [];
  const bodyEvents: Record<string, any>[] = [];

  for (let ago = HISTORY_DAYS; ago >= 1; ago--) {
    const day = daysAgo(now, ago);
    const date = localDate(day);
    const low = lowness(ago);

    // Sleep for the night before this day. Poor through the low patch.
    const sleepScore = clamp(4 - low * 2.4 + jitter(1.1), 1, 5);
    const sleepSkipped = rand() < 0.05;
    if (!sleepSkipped) {
      const logged = atLocal(day, 8, 10 + Math.floor(rand() * 40));
      sleepLogs.push({
        id: `sleep-${ago}`,
        user_id: USER_ID,
        log_date: date,
        score: sleepScore,
        hours_slept: Math.round((4.5 + sleepScore * 0.75 + jitter(0.5)) * 2) / 2,
        skipped: false,
        created_at: logged.toISOString(),
      });
    }
    // A poor night drags the next day down on its own, separately from the
    // low patch — that is what the sleep connection detectors look for.
    const sleepDrag = (3.5 - sleepScore) * 0.6;

    const slots: [number, number][] = [[10, 0], [14, 30], [19, 30]];
    slots.forEach(([h, m], slot) => {
      const scheduled = atLocal(day, h, m + Math.floor(jitter(20)) + 20);
      const base = {
        id: `checkin-${ago}-${slot}`,
        user_id: USER_ID,
        scheduled_at: scheduled.toISOString(),
        scheduled_date: date,
        expires_at: new Date(scheduled.getTime() + 30 * 60_000).toISOString(),
        created_at: daysAgo(now, ago + 1).toISOString(),
      };
      // About one in eight missed, slightly more when things are bad.
      if (rand() < 0.1 + low * 0.08) {
        checkIns.push({ ...base, status: 'expired' });
        return;
      }
      const afternoonDip = slot === 1 ? 1.1 : 0;
      const mood = 6.3 - low * 3.2 - sleepDrag * 0.5 + jitter(0.9);
      checkIns.push({
        ...base,
        status: 'completed',
        completed_at: new Date(scheduled.getTime() + (2 + rand() * 15) * 60_000).toISOString(),
        mood: clamp(mood),
        // Tied to mood so the two read as moving together.
        energy: clamp(mood - 0.3 - sleepDrag - afternoonDip + jitter(0.7)),
        anxiety: clamp(3.8 + low * 3.6 + jitter(1)),
        concentration: clamp(6.2 - low * 2.8 - sleepDrag * 0.7 - afternoonDip * 0.5 + jitter(0.9)),
        notes: slot === 2 ? NOTES[ago] ?? null : null,
        edit_count: 0,
      });
    });

    // Evening body check-in, most days.
    if (rand() < 0.9) {
      const id = `body-${ago}`;
      const fatigue = clamp(3.5 + low * 4 + sleepDrag * 1.4 + jitter(1));
      const pain = clamp(3 + low * 1.5 + jitter(1.4));
      const loggedAt = atLocal(day, 20, Math.floor(rand() * 50));
      bodyCheckIns.push({
        id,
        user_id: USER_ID,
        entry_date: date,
        fatigue,
        pain_mechanical: pain,
        brain_fog: clamp(fatigue - 1 + jitter(1)),
        gut: clamp(2.5 + low * 1.5 + jitter(1.2)),
        pain_diffuse: false,
        pain_character: pain >= 5 ? ['aching', 'stiff'] : pain >= 4 ? ['aching'] : [],
        breathlessness_character: [],
        note: null,
        entered_retroactively: false,
        logged_at: loggedAt.toISOString(),
        edit_count: 0,
        created_at: loggedAt.toISOString(),
        updated_at: loggedAt.toISOString(),
      });
      if (pain >= 4) {
        painSites.push({ id: `${id}-site-1`, body_checkin_id: id, user_id: USER_ID, region: 'low_back', side: null, aspect: 'back' });
      }
      if (pain >= 5) {
        painSites.push({ id: `${id}-site-2`, body_checkin_id: id, user_id: USER_ID, region: 'knee', side: 'R', aspect: 'front' });
      }
    }
  }

  // A few events, so History's body rows and Insights' event sections have
  // something in them.
  for (const [ago, type] of [[44, 'migraine_onset'], [23, 'crash_onset'], [20, 'migraine_onset'], [11, 'subluxation']] as const) {
    bodyEvents.push({
      id: `event-${ago}`,
      user_id: USER_ID,
      event_date: localDate(daysAgo(now, ago)),
      event_type: type,
      body_checkin_id: bodyCheckIns.find(b => b.id === `body-${ago}`)?.id ?? null,
      entered_retroactively: false,
      character: null,
      created_at: atLocal(daysAgo(now, ago), 20).toISOString(),
    });
  }
  const eventSites = [{
    id: 'event-11-site', body_event_id: 'event-11', user_id: USER_ID, region: 'shoulder', side: 'L',
  }];

  const marker = (ago: number, label: string, marker_type: string, medication_action?: string) => ({
    id: `marker-${ago}`,
    user_id: USER_ID,
    marker_date: localDate(daysAgo(now, ago)),
    label,
    marker_type,
    medication_action: medication_action ?? null,
    created_at: daysAgo(now, ago).toISOString(),
    updated_at: daysAgo(now, ago).toISOString(),
  });
  const markers = [
    marker(27, 'Moved house', 'life_event'),
    marker(17, 'Started new medication', 'medication', 'start'),
    marker(9, 'Started CBT', 'therapy'),
  ];

  return { checkIns, sleepLogs, bodyCheckIns, painSites, bodyEvents, eventSites, markers };
}

export function seedTables(): Record<string, Record<string, any>[]> {
  const now = new Date();
  const today = localDate(now);
  const since = new Date(now);
  since.setDate(since.getDate() - 56);
  const sinceIso = since.toISOString();

  const profile = {
    id: USER_ID,
    email: DEMO_USER.email,
    display_name: 'Alex',
    created_at: sinceIso,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    onboarding_complete: true,
    push_enabled: false,
    simplified_colors: false,
    comfort_mode: false,
    comfort_until: null,
    comfort_pauses_reminders: true,
    accent: 'porcelain',
    haptic_feedback_enabled: false,
    symptom_summary_enabled: false,
    report_display_name: 'Alex',
    body_tracking_enabled: true,
    body_setup_complete: true,
    // Open all day, so a visitor at any hour can try the body check-in. A
    // real user would usually pick an evening time.
    body_available_from: '00:00',
    body_reminder_time: '20:00',
    body_backfill_days: 3,
    body_domains_active: ['fatigue', 'pain_mechanical', 'brain_fog', 'gut'],
    body_morning_enabled: false,
    body_morning_time: '08:00',
    body_morning_domains: [],
    cycle_tracking_enabled: false,
    date_of_birth: '1990-04-12',
    age_confirmed_18: true,
    mind_not_health_service_ack: true,
    mind_data_consent: true,
    mind_consent_recorded_at: sinceIso,
    body_consent_recorded_at: sinceIso,
    cycle_day_one_prompt_ack_at: sinceIso,
    app_lock_enabled: false,
    app_lock_pin_hash: null,
    app_lock_pin_salt: null,
  };

  const settings = {
    id: 'settings-1',
    user_id: USER_ID,
    check_ins_per_day: 3,
    window_start: '09:00:00',
    window_end: '21:00:00',
    quick_checkin_domains: ACTIVE_DOMAINS,
    active_domains: ACTIVE_DOMAINS,
    time_format: '12hr',
    dnd_enabled: false,
    dnd_start_time: null,
    dnd_end_time: null,
    setup_times_confirmed_at: sinceIso,
    setup_notifications_ack_at: sinceIso,
    setup_preferences_ack_at: sinceIso,
    created_at: sinceIso,
    updated_at: sinceIso,
  };

  const baselines = ACTIVE_DOMAINS.map((domain, i) => ({
    id: `baseline-${i}`,
    user_id: USER_ID,
    domain,
    baseline_score: domain === 'anxiety' ? 4 : 6,
    baseline_variability: 1.2,
    set_at: sinceIso,
    source: 'onboarding',
    is_current: true,
  }));

  // Today's three check-ins, which in production the schedule-daily-checkins
  // cron would have written overnight. The first is due now, so the visitor
  // has one to fill in. The later two are relative to now as well, rather
  // than fixed times, so a late-evening visitor doesn't find them already
  // expired.
  const hour = 60 * 60_000;
  const times = [now.getTime() - 5 * 60_000, now.getTime() + 3 * hour, now.getTime() + 6 * hour];
  const todayCheckIns = times.map((scheduled, i) => ({
    id: `checkin-today-${i}`,
    user_id: USER_ID,
    scheduled_at: new Date(scheduled).toISOString(),
    scheduled_date: today,
    expires_at: new Date(scheduled + 30 * 60_000).toISOString(),
    status: 'pending',
    created_at: sinceIso,
  }));

  const history = buildHistory(now);

  // An appointment next week, so Prepare opens on something to prepare for.
  const appointment = {
    id: 'appointment-1',
    user_id: USER_ID,
    appointment_date: localDate(daysAgo(now, -6)),
    focus_areas: [],
    focus_categories: ['mind', 'body'],
    notes: null,
    is_completed: false,
    created_at: daysAgo(now, 10).toISOString(),
    updated_at: daysAgo(now, 10).toISOString(),
  };
  const questions = [
    'Is the new medication likely to be why my sleep is better?',
    'How long should I give it before we review the dose?',
    'Could the afternoon energy crashes be related to anything else?',
  ].map((question_text, i) => ({
    id: `question-${i}`,
    user_id: USER_ID,
    appointment_id: appointment.id,
    question_text,
    is_priority: i === 0,
    is_auto_generated: false,
    source_pattern_id: null,
    source_pattern_source: null,
    sort_order: i,
    is_addressed: false,
    created_at: daysAgo(now, 5 - i).toISOString(),
    updated_at: daysAgo(now, 5 - i).toISOString(),
  }));

  return {
    profiles: [profile],
    check_in_settings: [settings],
    baselines,
    check_ins: [...history.checkIns, ...todayCheckIns],
    sleep_logs: history.sleepLogs,
    body_checkins: history.bodyCheckIns,
    body_pain_sites: history.painSites,
    body_events: history.bodyEvents,
    body_event_sites: history.eventSites,
    intervention_markers: history.markers,
    appointments: [appointment],
    prepare_questions: questions,
  };
}
