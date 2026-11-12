import * as Crypto from 'expo-crypto';

import { submit } from '@/lib/offline/outbox';
import { overlayAppointments } from '@/lib/offline/overlays';
import { readThrough } from '@/lib/offline/read-through';
import { currentUserId } from '@/lib/offline/session';
import { supabase } from '@/lib/supabase';
import type { Appointment, AppointmentFocusCategory } from '@/lib/supabase';

// Port of the web app's src/lib/api/appointments.ts.
//
// Offline: reads fall back to the last list read (read-through.ts) and writes
// go through the outbox with ids made here, so an appointment can be added,
// changed, removed or marked done with no connection. Both reads lay unsent
// changes over what they return. Writes still throw when the server rejects
// them, which is what the callers' error handling expects.

/** The soonest appointment not yet marked done, or null. Worked out from the
 *  full list so unsent changes (a new one, one marked done) count. */
export async function fetchUpcomingAppointment(userId: string): Promise<Appointment | null> {
  const all = await fetchAllAppointments(userId);
  return all
    .filter(a => !a.is_completed)
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))[0] ?? null;
}

/** Every appointment, newest first. */
export async function fetchAllAppointments(userId: string): Promise<Appointment[]> {
  const rows = await readThrough('appointments.all', async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', userId)
      .order('appointment_date', { ascending: false });

    if (error) throw error;
    return (data || []) as Appointment[];
  });
  return overlayAppointments(rows).sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
}

async function send(...args: Parameters<typeof submit>): Promise<void> {
  const result = await submit(...args);
  if (result.status === 'rejected') throw new Error(result.error);
}

async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error('Not authenticated');
  return id;
}

export async function createAppointment(
  userId: string,
  appointmentDate: string,
  focusAreas?: string[],
  focusCategories?: AppointmentFocusCategory[],
): Promise<Appointment> {
  const now = new Date().toISOString();
  const row = {
    // Made here so a resend is recognised as the same appointment, and so
    // questions added to it offline can point at it before it reaches the
    // server (the outbox sends them after it, in order).
    id: Crypto.randomUUID(),
    user_id: userId,
    appointment_date: appointmentDate,
    focus_areas: focusAreas || [],
    focus_categories: focusCategories?.length ? focusCategories : ['mind' as AppointmentFocusCategory],
    notes: null,
    is_completed: false,
    created_at: now,
    updated_at: now,
  };
  await send(userId, 'appointment.create', { row });
  return row;
}

export async function updateAppointment(
  appointmentId: string,
  updates: Partial<Omit<Appointment, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  await send(await requireUserId(), 'appointment.update', { id: appointmentId, updates });
}

export async function completeAppointment(
  appointmentId: string,
  notes?: string
): Promise<void> {
  return updateAppointment(appointmentId, {
    is_completed: true,
    notes: notes ?? null,
  });
}

export async function deleteAppointment(appointmentId: string): Promise<void> {
  await send(await requireUserId(), 'appointment.delete', { id: appointmentId });
}
