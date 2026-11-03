// The demo's starting data: Aisha, the persona behind the website's sample
// report (docs/demo-profile-aisha.md), already through onboarding
// and every Today setup card, so a visitor lands straight on Today.
//
// Her 90 days are not generated here. aisha-tables.json is written by the
// same run that builds the sample PDF (scripts/sample-report/build.mjs): her
// raw rows plus everything the app's detectors stored from them, replayed
// week by week the way a phone would have run them. So Insights, History and
// Prepare show exactly the findings the report prints. Rebuild the report and
// this file changes with it; commit them together.
//
// The file is dated as of the day it was built, with timestamps as local
// wall-clock time. Loading moves every date forward by the days since, and
// reads the times in the visitor's own zone, so the history always ends
// yesterday and a 9:10am check-in is at 9:10am wherever it is opened.

import type { User } from '@supabase/supabase-js';

import aisha from './aisha-tables.json';

type Row = Record<string, any>;

const USER_ID = 'demo-aisha'; // must match scripts/sample-report/aisha-data.ts

export const DEMO_USER = {
  id: USER_ID,
  email: 'demo@symetric.app',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as User;

function localDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Moves every date in a row, however deeply nested, forward by `days`. */
function shift(value: unknown, days: number): unknown {
  if (typeof value === 'string') {
    let m = value.match(DATE_ONLY);
    if (m) return localDate(new Date(+m[1], +m[2] - 1, +m[3] + days));
    m = value.match(WALL_CLOCK);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3] + days, +m[4], +m[5], +m[6]).toISOString();
    return value;
  }
  if (Array.isArray(value)) return value.map(v => shift(v, days));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, days)]));
  }
  return value;
}

export function seedTables(): Record<string, Row[]> {
  const now = new Date();
  const today = localDate(now);
  const [y, m, d] = aisha.builtFor.split('-').map(Number);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(y, m - 1, d).getTime()) / 86_400_000);
  const tables = shift(aisha.tables, days) as Record<string, Row[]>;

  const started = new Date(now);
  started.setDate(started.getDate() - 91);
  const startedIso = started.toISOString();

  // The report pipeline only needed the profile and settings columns it reads.
  // The app reads the rest, so fill in an account that has finished setup.
  const profile = {
    email: DEMO_USER.email,
    created_at: startedIso,
    onboarding_complete: true,
    push_enabled: false,
    simplified_colors: false,
    comfort_mode: false,
    comfort_until: null,
    comfort_pauses_reminders: true,
    haptic_feedback_enabled: false,
    symptom_summary_enabled: false,
    body_setup_complete: true,
    body_reminder_time: '20:00',
    body_backfill_days: 3,
    body_morning_time: '08:00',
    date_of_birth: '1997-03-18',
    age_confirmed_18: true,
    mind_not_health_service_ack: true,
    mind_data_consent: true,
    mind_consent_recorded_at: startedIso,
    body_consent_recorded_at: startedIso,
    cycle_consent_recorded_at: startedIso,
    app_lock_enabled: false,
    app_lock_pin_hash: null,
    app_lock_pin_salt: null,
    ...tables.profiles[0],
    // Her timezone is whoever is looking.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Open all day, so a visitor at any hour can try the body check-in. A real
    // user would usually pick an evening time.
    body_available_from: '00:00',
  };

  const storedSettings = tables.check_in_settings[0];
  const settings = {
    dnd_enabled: false,
    dnd_start_time: null,
    dnd_end_time: null,
    ...storedSettings,
    quick_checkin_domains: storedSettings.active_domains,
    setup_times_confirmed_at: startedIso,
    setup_notifications_ack_at: startedIso,
    setup_preferences_ack_at: startedIso,
  };

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
    created_at: startedIso,
  }));

  return {
    ...tables,
    profiles: [profile],
    check_in_settings: [settings],
    appointments: tables.appointments.map(a => ({ focus_categories: ['mind', 'body'], ...a })),
    check_ins: [...tables.check_ins, ...todayCheckIns],
  };
}
