// The demo's starting data: one invented person, already through onboarding
// and every Today setup card, so a visitor lands straight on Today.
//
// Everything is dated relative to the moment the demo opens, so the history
// always ends "today" whenever someone visits the site.

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
    body_available_from: '17:00',
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
  // has one to fill in.
  const times = [new Date(now.getTime() - 5 * 60_000), atLocal(now, 15), atLocal(now, 19)];
  const checkIns = times.map((scheduled, i) => {
    return {
      id: `checkin-today-${i}`,
      user_id: USER_ID,
      scheduled_at: scheduled.toISOString(),
      scheduled_date: today,
      expires_at: new Date(scheduled.getTime() + 30 * 60_000).toISOString(),
      status: 'pending',
      created_at: sinceIso,
    };
  });

  return {
    profiles: [profile],
    check_in_settings: [settings],
    baselines,
    check_ins: checkIns,
  };
}
