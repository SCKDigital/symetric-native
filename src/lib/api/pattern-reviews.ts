import { supabase } from '@/lib/supabase';
import type { PatternSource, PreparePatternReview } from '@/lib/supabase';

// Direct port of the web app's src/lib/api/patternReviews.ts — pure Supabase
// queries, nothing to adapt.

export async function fetchPatternReviewsForAppointment(appointmentId: string): Promise<PreparePatternReview[]> {
  const { data, error } = await supabase
    .from('prepare_pattern_reviews')
    .select('*')
    .eq('appointment_id', appointmentId);

  if (error) throw error;
  return data || [];
}

/**
 * Upsert a pattern review — creates if new, updates if exists (keyed on
 * appointment_id + pattern_id + pattern_source, since pattern ids are only
 * unique within their source table).
 */
export async function upsertPatternReview(
  userId: string,
  appointmentId: string,
  patternId: string,
  shouldDiscuss: boolean,
  userNote?: string,
  patternSource: PatternSource = 'cluster'
): Promise<PreparePatternReview> {
  const { data, error } = await supabase
    .from('prepare_pattern_reviews')
    .upsert(
      {
        user_id: userId,
        appointment_id: appointmentId,
        pattern_id: patternId,
        pattern_source: patternSource,
        should_discuss: shouldDiscuss,
        user_note: userNote ?? null,
      },
      { onConflict: 'appointment_id,pattern_id,pattern_source' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
