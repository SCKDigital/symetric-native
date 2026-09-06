// ── Sleep connections query helpers ─────────────────────────────────────────
// Direct port of the web app's src/lib/queries/sleepConnections.ts.

import { supabase } from '@/lib/supabase';

export interface SleepSymptomConnection {
  id: string;
  user_id: string;
  domain: string;
  affected_by_sleep: boolean;
  avg_after_good_sleep: number;
  avg_after_poor_sleep: number;
  difference: number;
  sample_size: number;
  good_sleep_count: number;
  poor_sleep_count: number;
  window_start: string;
  window_end: string;
  detected_at: string;
}

/**
 * The latest sleep connections for a user — one row per domain from the most
 * recent detection window that overlaps the selected range, strongest first.
 *
 * Two queries rather than one: the rows are only comparable within a single
 * detection window, so the window is picked first and then read whole. Mixing
 * rows from different windows would put differently-sampled numbers side by
 * side.
 */
export async function fetchLatestSleepConnections(
  userId: string,
  from?: string,
): Promise<SleepSymptomConnection[]> {
  const cutoff = from ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString('en-CA');
  })();

  const { data: latest } = await supabase
    .from('sleep_symptom_connections')
    .select('window_start')
    .eq('user_id', userId)
    .gte('window_end', cutoff)
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return [];

  const { data, error } = await supabase
    .from('sleep_symptom_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('window_start', latest.window_start)
    .order('difference', { ascending: false });

  if (error) {
    console.error('[Sleep Connections Query] Fetch error:', error);
    return [];
  }

  return (data ?? []) as SleepSymptomConnection[];
}
