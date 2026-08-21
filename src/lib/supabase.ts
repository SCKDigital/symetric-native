import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No browser URL to parse a session out of on native — the magic-link
    // callback instead arrives as a deep link handled by expo-router/expo-linking.
    detectSessionInUrl: false,
  },
  realtime: { enabled: false } as never,
});

// Supabase's token auto-refresh timer keeps running in the background unless
// told otherwise — on native that drains battery and can throw once the app
// is backgrounded long enough for the refresh to fail. Tie it to app
// foreground/background state instead, per Supabase's own RN guidance.
AppState.addEventListener('change', state => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export type DomainType =
  | 'mood'
  | 'energy'
  | 'anxiety'
  | 'concentration'
  | 'irritability'
  | 'social_battery'
  | 'sensory_sensitivity'
  | 'motivation';

// ── Body tracking (alpha, capture only) ─────────────────────────────────────────

export type BodyDomainType =
  | 'fatigue'
  /** @deprecated 2026-08-20 — split into 'pain_mechanical' and 'pain_widespread'. Kept for reading pre-boundary rows only; see PAIN_SPLIT_BOUNDARY_DATE in src/lib/body/constants.ts. */
  | 'pain'
  | 'pain_mechanical'
  | 'pain_widespread'
  | 'joint_instability'
  | 'breathlessness'
  | 'orthostatic'
  | 'gut'
  | 'exhaustion';

export type BodySide = 'L' | 'R';
export type BodyAspect = 'front' | 'back';

export type BodyEventType =
  | 'subluxation'
  | 'presyncope'
  | 'migraine_onset'
  | 'crash_onset'
  | 'reaction'
  | 'injury'
  | 'palpitations';

export type BaselineSource = 'onboarding' | 'rolling_median' | 'manual_reset';
export type CheckInStatus = 'pending' | 'completed' | 'expired';
export type ClusterType =
  | 'sustained_deviation'
  | 'intraday_volatility'
  | 'rapid_cycling'
  | 'expiry_correlated'
  | 'baseline_shift';

export interface Profile {
  id: string;
  email: string;
  display_name?: string;
  created_at: string;
  timezone: string;
  onboarding_complete: boolean;
  push_enabled: boolean;
  simplified_colors: boolean;
  comfort_mode: boolean;
  haptic_feedback_enabled: boolean;
  symptom_summary_enabled: boolean;  // WP4: off by default, requires product/clinical sign-off
  report_display_name?: string | null; // optional name/nickname for the clinical report header
  body_tracking_enabled: boolean; // master toggle for the body-tracking alpha, off by default
  body_setup_complete: boolean; // true once the user has been through the "Set up Body tracking" Today card
  body_available_from: string; // HH:MM — local time the Today body card starts showing
  body_reminder_time: string; // HH:MM — local time the single daily body-checkin push fires
  body_backfill_days: number; // how many days back the body date selector allows, 0-7
  body_domains_active: BodyDomainType[];
  body_reminder_sent_date?: string | null; // local date the reminder push was last sent, dedup guard
  body_morning_enabled: boolean; // opt-in, off by default — optional morning check-in
  body_morning_time: string; // HH:MM — local time the Today morning card starts showing / reminder fires
  body_morning_reminder_sent_date?: string | null; // dedup guard, same purpose as body_reminder_sent_date
  cycle_tracking_enabled: boolean; // opt-in for period event markers + phase/day display in History
  date_of_birth?: string | null; // 'YYYY-MM-DD', collected at onboarding for the 18+ age gate
  age_confirmed_18: boolean; // the onboarding "I confirm I am 18 years or older" checkbox
  mind_not_health_service_ack: boolean; // onboarding disclosure ack: not a mental health service/diagnostic tool
  mind_data_consent: boolean; // onboarding consent: mental-domain data collection
  mind_consent_recorded_at?: string | null;
  body_consent_recorded_at?: string | null; // set only when body_tracking_enabled was turned on at onboarding
  cycle_consent_recorded_at?: string | null; // set only when cycle_tracking_enabled was turned on at onboarding
  consent_ip_address?: string | null; // server-observed, stamped by the record-consent edge function
  consent_user_agent?: string | null;
  app_lock_enabled: boolean; // opt-in, off by default — requires PIN before showing the app
  app_lock_pin_hash?: string | null; // SHA-256(salt:pin) hex digest, verified client-side
  app_lock_pin_salt?: string | null;
}

// ── WP2: Pinned connections ────────────────────────────────────────────────────

export interface PinnedConnection {
  id: string;
  user_id: string;
  factor_a: string;       // domain column name or 'sleep'
  factor_b: string;
  lag: 'same_day' | 'next_day';
  created_at: string;
  last_evaluated_at: string | null;
  last_direction: 'together' | 'inverse' | 'none' | null;
  last_sufficient: boolean | null;
}

export interface Baseline {
  id: string;
  user_id: string;
  domain: DomainType;
  baseline_score: number;
  baseline_variability?: number;
  set_at: string;
  source: BaselineSource;
}

export interface CheckInSettings {
  id: string;
  user_id: string;
  check_ins_per_day: number;
  window_start: string;
  window_end: string;
  quick_checkin_domains: DomainType[]; // DEPRECATED - keep for migration compatibility
  active_domains: DomainType[]; // NEW - replaces quick_checkin_domains
  time_format: '12hr' | '24hr';
  dnd_enabled: boolean;
  dnd_start_time: string | null; // HH:MM:SS format
  dnd_end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: string;
  user_id: string;
  scheduled_at: string;
  scheduled_date?: string;
  expires_at: string;
  completed_at?: string;
  status: CheckInStatus;
  mood?: number;
  energy?: number;
  anxiety?: number;
  concentration?: number;
  irritability?: number;
  social_battery?: number;
  sensory_sensitivity?: number;
  motivation?: number;
  notes?: string;
  rescheduled_at?: string | null;
  notified_at?: string | null;
  edited_at?: string | null;
  edit_count?: number;
}

export interface SleepLog {
  id: string;
  user_id: string;
  log_date: string;
  score: number | null;
  hours_slept: number | null;
  skipped: boolean;
  created_at: string;
  edited_at?: string | null;
  edit_count?: number;
}

// ── Body tracking tables (alpha, capture only) ──────────────────────────────────

export interface BodyCheckIn {
  id: string;
  user_id: string;
  entry_date: string; // DATE as YYYY-MM-DD
  fatigue?: number | null;
  /** @deprecated 2026-08-20 — see BodyDomainType['pain']. Read-only. */
  pain?: number | null;
  pain_mechanical?: number | null;
  pain_widespread?: number | null;
  joint_instability?: number | null;
  breathlessness?: number | null;
  orthostatic?: number | null;
  gut?: number | null;
  exertion?: number | null;
  exhaustion?: number | null;
  morning_fatigue?: number | null;
  morning_pain?: number | null;
  morning_orthostatic?: number | null;
  morning_logged_at?: string | null;
  pain_diffuse: boolean;
  /** Descriptive tags only — never scored, never enters detection. Shown when pain_mechanical or pain_widespread > 0. */
  pain_character: string[];
  /** Descriptive tags only — never scored, never enters detection. Shown when breathlessness > 0. */
  breathlessness_character: string[];
  note?: string | null;
  entered_retroactively: boolean;
  logged_at: string;
  edit_count: number;
  edited_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyPainSite {
  id: string;
  body_checkin_id: string;
  user_id: string;
  region: string;
  side: BodySide | null; // anatomical (subject's) side; null for midline regions
  aspect: BodyAspect;
}

export interface BodyEvent {
  id: string;
  user_id: string;
  event_date: string; // DATE as YYYY-MM-DD
  event_type: BodyEventType;
  body_checkin_id?: string | null;
  entered_retroactively: boolean;
  /** Descriptive tags, e.g. what a reaction felt like — only meaningful for event types with characterPrompt. */
  character?: string[] | null;
  created_at: string;
}

export interface BodyEventSite {
  id: string;
  body_event_id: string;
  user_id: string;
  region: string;
  side: BodySide | null;
}

export interface DetectedCluster {
  id: string;
  user_id: string;
  start_date: string;
  end_date?: string;
  ongoing: boolean;
  cluster_type?: ClusterType;
  domains_involved: DomainType[];
  direction?: 'elevated' | 'depressed' | null;
  severity_score?: number;
  volatility_score?: number;
  avg_sleep_during_pattern?: number | null;
  improved_with_sleep?: boolean;
  high_despite_poor_sleep?: boolean;
  data_points_used?: number | null;
  data_quality?: 'solid' | 'partial' | 'limited' | null;
  user_notes?: string;
  enrichment_completed: boolean;
  flagged_for_report?: boolean;
  created_at: string;
}

export interface ContextTag {
  id: string;
  user_id: string;
  cluster_id: string;
  tag: string;
}

// ── Prepare tab types ──────────────────────────────────────────────────────────

export type AppointmentFocusCategory = 'mind' | 'body';

/** Which table a Prepare pattern reference (pattern_id / source_pattern_id) actually belongs to. */
export type PatternSource = 'cluster' | 'sleep_connection';

export interface Appointment {
  id: string;
  user_id: string;
  appointment_date: string; // DATE as YYYY-MM-DD
  focus_areas: string[] | null;
  focus_categories: AppointmentFocusCategory[]; // which check-in categories this appointment is about
  notes: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrepareQuestion {
  id: string;
  user_id: string;
  appointment_id: string | null;
  question_text: string;
  is_priority: boolean;
  is_auto_generated: boolean;
  source_pattern_id: string | null;
  source_pattern_source: PatternSource | null;
  sort_order: number;
  is_addressed: boolean;
  created_at: string;
  updated_at: string;
}

export interface PreparePatternReview {
  id: string;
  user_id: string;
  appointment_id: string;
  pattern_id: string;
  pattern_source: PatternSource;
  should_discuss: boolean;
  user_note: string | null;
  was_discussed: boolean;
  created_at: string;
  updated_at: string;
}
