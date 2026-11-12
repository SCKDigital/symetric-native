import { readThrough } from '@/lib/offline/read-through';
import { supabase } from '@/lib/supabase';
import type { Appointment, AppointmentFocusCategory } from '@/lib/supabase';

// Direct port of the web app's src/lib/api/appointments.ts — pure Supabase
// queries, no browser-specific APIs, nothing to adapt.

// The two reads fall back to their last result offline (see read-through.ts),
// so Prepare and Today's reminder card still show the next appointment.
// Creating, editing and completing appointments still need a connection.
export async function fetchUpcomingAppointment(userId: string): Promise<Appointment | null> {
  return readThrough('appointments.upcoming', () => readUpcoming(userId));
}

async function readUpcoming(userId: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .order('appointment_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchAllAppointments(userId: string): Promise<Appointment[]> {
  return readThrough('appointments.all', () => readAll(userId));
}

async function readAll(userId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .order('appointment_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createAppointment(
  userId: string,
  appointmentDate: string,
  focusAreas?: string[],
  focusCategories?: AppointmentFocusCategory[],
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: userId,
      appointment_date: appointmentDate,
      focus_areas: focusAreas || [],
      focus_categories: focusCategories?.length ? focusCategories : ['mind'],
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateAppointment(
  appointmentId: string,
  updates: Partial<Omit<Appointment, 'id' | 'user_id' | 'created_at'>>
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', appointmentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function completeAppointment(
  appointmentId: string,
  notes?: string
): Promise<Appointment> {
  return updateAppointment(appointmentId, {
    is_completed: true,
    notes: notes ?? null,
  });
}

export async function deleteAppointment(appointmentId: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', appointmentId);

  if (error) throw error;
}
