// Ported from the web app's src/lib/queries/markers.ts. Reads are unchanged;
// writes go through the outbox (lib/offline/outbox.ts), so a marker added,
// edited or deleted offline is kept on the phone and sent later. They still
// throw when the server rejects the change, which is what every caller's
// existing error handling expects.

import * as Crypto from 'expo-crypto';

import { submit } from '@/lib/offline/outbox';
import { overlayMarkers } from '@/lib/offline/overlays';
import { readThrough } from '@/lib/offline/read-through';
import { currentUserId } from '@/lib/offline/session';
import { supabase } from '@/lib/supabase';
import type { CreateMarkerInput, InterventionMarker, UpdateMarkerInput } from '@/types/marker';

/** Every marker, newest first. Offline, the last list read, with unsent
 *  changes laid over it either way. */
export async function fetchMarkers(): Promise<InterventionMarker[]> {
  const rows = await readThrough('markers.all', async () => {
    const { data, error } = await supabase.from('intervention_markers').select('*').order('marker_date', { ascending: false });

    if (error) throw error;
    return (data || []) as InterventionMarker[];
  });
  return overlayMarkers(rows).sort((a, b) => b.marker_date.localeCompare(a.marker_date));
}

export async function fetchMarkersInRange(startDate: string, endDate: string): Promise<InterventionMarker[]> {
  const { data, error } = await supabase.from('intervention_markers').select('*').gte('marker_date', startDate).lte('marker_date', endDate).order('marker_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

/** The signed-in user, without a server round trip. getUser() asks the
 *  server, which made adding a marker offline fail as "Not authenticated". */
async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error('Not authenticated');
  return id;
}

async function send(...args: Parameters<typeof submit>): Promise<void> {
  const result = await submit(...args);
  if (result.status === 'rejected') throw new Error(result.error);
}

export async function createMarker(input: CreateMarkerInput): Promise<InterventionMarker> {
  const userId = await requireUserId();
  const now = new Date().toISOString();
  // The id is made here so a resend is recognised as the same marker.
  const row = { id: Crypto.randomUUID(), user_id: userId, ...input, created_at: now, updated_at: now };
  await send(userId, 'marker.create', { row });
  return row as unknown as InterventionMarker;
}

export async function updateMarker(input: UpdateMarkerInput): Promise<void> {
  const { id, ...updates } = input;
  await send(await requireUserId(), 'marker.update', { id, updates });
}

export async function deleteMarker(id: string): Promise<void> {
  await send(await requireUserId(), 'marker.delete', { id });
}
