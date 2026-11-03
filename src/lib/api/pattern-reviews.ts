import { supabase } from '@/lib/supabase';
import type { PreparePatternReview } from '@/lib/supabase';

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

// Read-only now. Prepare's pattern review section, the only writer, was
// removed in 9152075; rows written before then still reach the report.
