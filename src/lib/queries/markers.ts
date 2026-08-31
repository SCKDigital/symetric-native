// Ported from the web app's src/lib/queries/markers.ts, unchanged.

import { supabase } from '@/lib/supabase';
import type { CreateMarkerInput, InterventionMarker, UpdateMarkerInput } from '@/types/marker';

export async function fetchMarkers(): Promise<InterventionMarker[]> {
  const { data, error } = await supabase.from('intervention_markers').select('*').order('marker_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchMarkersInRange(startDate: string, endDate: string): Promise<InterventionMarker[]> {
  const { data, error } = await supabase.from('intervention_markers').select('*').gte('marker_date', startDate).lte('marker_date', endDate).order('marker_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createMarker(input: CreateMarkerInput): Promise<InterventionMarker> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('intervention_markers')
    .insert({ user_id: user.id, ...input })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMarker(input: UpdateMarkerInput): Promise<InterventionMarker> {
  const { id, ...updates } = input;

  const { data, error } = await supabase.from('intervention_markers').update(updates).eq('id', id).select().single();

  if (error) throw error;
  return data;
}

export async function deleteMarker(id: string): Promise<void> {
  const { error } = await supabase.from('intervention_markers').delete().eq('id', id);

  if (error) throw error;
}
