import { isNetworkError } from '@/lib/offline/cache';
import { supabase, type BodyEventType, type DomainType } from '@/lib/supabase';

// The commands the outbox can send, and how each one is sent.
//
// Every handler must be safe to run more than once with the same payload: the
// app can be killed between the server accepting a write and the outbox
// removing the command, and then the command is sent again. Two rules keep
// that true:
//
//  1. Ids and timestamps are decided when the person saves, not when the
//     command is sent. A bonus check-in carries the id it will have on the
//     server, so a second send is ON CONFLICT DO NOTHING; an edit carries its
//     edited_at, so a second send leaves edit_count alone (the
//     increment_edit_count_on_edit trigger only counts a *changed* edited_at).
//     It also keeps the record honest about when something was logged — a
//     check-in made on a plane at 09:00 must not read as completed at 14:00
//     when the plane lands.
//  2. Handlers set state, they don't add to it. "Status is completed with
//     these values", never "add one".
//
// Handlers throw on failure. A SyncError carries the HTTP status so the
// outbox can tell "couldn't reach the server" (keep, try again) from "the
// server said no" (stop, tell the person).

export type DomainValues = Partial<Record<DomainType, number>>;

export interface CommandPayloads {
  /** A scheduled check-in answered, from the form or the one-tap. */
  'checkIn.complete': {
    checkInId: string;
    completedAt: string;
    notes?: string;
    values: DomainValues;
    lowDemand?: boolean;
  };
  /** A completed check-in corrected inside its edit window. */
  'checkIn.edit': {
    checkInId: string;
    editedAt: string;
    notes?: string;
    values: DomainValues;
  };
  /** An unscheduled check-in. The row is built in full on the phone, id included. */
  'checkIn.bonus': {
    row: Record<string, unknown> & { id: string };
  };

  /**
   * The evening body check-in: the day's row, its pain sites, and its events,
   * as the form left them. Sent as the state to arrive at, not the steps the
   * form took, so it reconciles against whatever the server holds when it is
   * finally sent.
   */
  'body.save': {
    entryDate: string;
    /** body_checkins columns other than user_id and entry_date. */
    fields: Record<string, unknown>;
    painSites: { region: string; side: string | null; aspect: string | null }[];
    /** Every event ticked on the form. newId is used only if the server has
     *  no event of that type for the day yet. */
    events: {
      type: BodyEventType;
      newId: string;
      retro: boolean;
      character: string[] | null;
      sites: { region: string; side: string | null }[];
    }[];
    /** Types the form loaded as ticked and the person unticked. Only these
     *  are deleted — never an event the form didn't know about. */
    removedEventTypes: BodyEventType[];
  };
  /** A body_checkins row written as a whole: the morning check-in, and the
   *  one-tap. insertOnly leaves an existing row for the day untouched. */
  'body.upsert': {
    entryDate: string;
    fields: Record<string, unknown>;
    insertOnly?: boolean;
  };

  /** The morning sleep score, one per day. */
  'sleep.save': {
    logDate: string;
    fields: Record<string, unknown>;
  };

  /** A scheduled check-in moved to a new time. fields are the columns it sets. */
  'checkIn.reschedule': { checkInId: string; fields: Record<string, unknown> };

  /** Profile columns, set outright: settings, comfort mode, accent, app lock. */
  'profile.update': { fields: Record<string, unknown> };
  /** check_in_settings columns, upserted on user_id (one row per user). */
  'checkInSettings.upsert': { fields: Record<string, unknown> };
  /** A new current baseline for one domain; earlier ones stop being current. */
  'baseline.set': { row: Record<string, unknown> & { id: string; domain: string } };
  /** Starting baselines at setup, inserted as they are. */
  'baseline.seed': { rows: (Record<string, unknown> & { id: string })[] };

  /** A pattern flagged, or unflagged, for the report. */
  'cluster.flag': { id: string; flagged: boolean };

  'appointment.create': { row: Record<string, unknown> & { id: string } };
  'appointment.update': { id: string; updates: Record<string, unknown> };
  'appointment.delete': { id: string };

  /** Prepare's questions for an appointment. */
  'question.create': { row: Record<string, unknown> & { id: string; appointment_id: string } };
  'question.update': { id: string; updates: Record<string, unknown> };
  'question.reorder': { ids: string[]; isPriority: boolean };
  'question.delete': { id: string };

  'marker.create': { row: Record<string, unknown> & { id: string } };
  'marker.update': { id: string; updates: Record<string, unknown> };
  'marker.delete': { id: string };
}

export type CommandType = keyof CommandPayloads;

export class SyncError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'SyncError';
  }
}

/** Throws a SyncError for a failed Supabase response. */
function must(res: { error: { message: string; code?: string } | null; status: number }) {
  if (res.error) throw new SyncError(res.error.message, res.status, res.error.code);
}

/**
 * Worth trying again later? Network failures, an expired session, rate
 * limiting and server errors are. A 4xx from PostgREST — RLS, a constraint, a
 * bad value — is the server's considered answer, and resending the same
 * payload will get the same one.
 */
export function isTransient(e: unknown): boolean {
  if (e instanceof SyncError) {
    if (isNetworkError(e, e.status)) return true;
    return e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500;
  }
  // Anything thrown rather than returned — fetch itself, a timeout — is the
  // transport, not the server.
  return true;
}

type Handlers = { [K in CommandType]: (payload: CommandPayloads[K], userId: string) => Promise<void> };

export const HANDLERS: Handlers = {
  'checkIn.complete': async ({ checkInId, completedAt, notes, values, lowDemand }) => {
    must(await supabase.from('check_ins').update({
      status: 'completed',
      completed_at: completedAt,
      notes,
      ...values,
      ...(lowDemand ? { low_demand: true } : {}),
    }).eq('id', checkInId));
  },

  'checkIn.edit': async ({ checkInId, editedAt, notes, values }) => {
    must(await supabase.from('check_ins').update({
      ...values,
      notes,
      edited_at: editedAt,
    }).eq('id', checkInId));
  },

  'checkIn.bonus': async ({ row }) => {
    must(await supabase.from('check_ins').upsert(row, { onConflict: 'id', ignoreDuplicates: true }));
  },

  'body.save': async ({ entryDate, fields, painSites, events, removedEventTypes }, userId) => {
    // One row per user per day (body_checkins_unique_day), so the day itself
    // is the key: a resend, or a row the morning check-in already made,
    // updates rather than duplicates.
    const saved = await supabase.from('body_checkins')
      .upsert({ user_id: userId, entry_date: entryDate, ...fields }, { onConflict: 'user_id,entry_date' })
      .select('id').single();
    must(saved);
    const checkinId = (saved.data as { id: string }).id;

    must(await supabase.from('body_pain_sites').delete().eq('body_checkin_id', checkinId));
    if (painSites.length > 0) {
      must(await supabase.from('body_pain_sites').insert(
        painSites.map(s => ({ body_checkin_id: checkinId, user_id: userId, ...s }))));
    }

    const existing = await supabase.from('body_events').select('id, event_type')
      .eq('user_id', userId).eq('event_date', entryDate);
    must(existing);
    const idByType = new Map(((existing.data ?? []) as { id: string; event_type: string }[])
      .map(e => [e.event_type, e.id]));

    for (const ev of events) {
      let eventId = idByType.get(ev.type);
      if (eventId) {
        must(await supabase.from('body_events').update({ character: ev.character }).eq('id', eventId));
      } else {
        eventId = ev.newId;
        must(await supabase.from('body_events').insert({
          id: eventId, user_id: userId, event_date: entryDate, event_type: ev.type,
          body_checkin_id: checkinId, entered_retroactively: ev.retro, character: ev.character,
        }));
      }
      must(await supabase.from('body_event_sites').delete().eq('body_event_id', eventId));
      if (ev.sites.length > 0) {
        must(await supabase.from('body_event_sites').insert(
          ev.sites.map(s => ({ body_event_id: eventId, user_id: userId, ...s }))));
      }
    }

    for (const type of removedEventTypes) {
      const eventId = idByType.get(type);
      if (eventId) must(await supabase.from('body_events').delete().eq('id', eventId));
    }
  },

  'body.upsert': async ({ entryDate, fields, insertOnly }, userId) => {
    must(await supabase.from('body_checkins').upsert(
      { user_id: userId, entry_date: entryDate, ...fields },
      { onConflict: 'user_id,entry_date', ignoreDuplicates: !!insertOnly },
    ));
  },

  'sleep.save': async ({ logDate, fields }, userId) => {
    must(await supabase.from('sleep_logs').upsert(
      { user_id: userId, log_date: logDate, ...fields },
      { onConflict: 'user_id,log_date' },
    ));
  },

  'checkIn.reschedule': async ({ checkInId, fields }) => {
    must(await supabase.from('check_ins').update(fields).eq('id', checkInId));
  },

  'profile.update': async ({ fields }, userId) => {
    must(await supabase.from('profiles').update(fields).eq('id', userId));
  },

  'checkInSettings.upsert': async ({ fields }, userId) => {
    must(await supabase.from('check_in_settings').upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' }));
  },

  'baseline.set': async ({ row }, userId) => {
    // Every other current row for the domain stops being current — but never
    // this one, so a resend after the insert landed leaves it current.
    must(await supabase.from('baselines').update({ is_current: false })
      .eq('user_id', userId).eq('domain', row.domain).eq('is_current', true).neq('id', row.id));
    must(await supabase.from('baselines').upsert({ user_id: userId, ...row }, { onConflict: 'id', ignoreDuplicates: true }));
  },

  'baseline.seed': async ({ rows }, userId) => {
    must(await supabase.from('baselines').upsert(
      rows.map(r => ({ user_id: userId, ...r })), { onConflict: 'id', ignoreDuplicates: true }));
  },

  'cluster.flag': async ({ id, flagged }) => {
    must(await supabase.from('detected_clusters').update({ flagged_for_report: flagged }).eq('id', id));
  },

  'appointment.create': async ({ row }) => {
    must(await supabase.from('appointments').upsert(row, { onConflict: 'id', ignoreDuplicates: true }));
  },

  'appointment.update': async ({ id, updates }) => {
    must(await supabase.from('appointments').update(updates).eq('id', id));
  },

  'appointment.delete': async ({ id }) => {
    must(await supabase.from('appointments').delete().eq('id', id));
  },

  'question.create': async ({ row }) => {
    must(await supabase.from('prepare_questions').upsert(row, { onConflict: 'id', ignoreDuplicates: true }));
  },

  'question.update': async ({ id, updates }) => {
    must(await supabase.from('prepare_questions').update(updates).eq('id', id));
  },

  'question.reorder': async ({ ids, isPriority }) => {
    // Each position set outright, so a resend lands on the same order.
    for (const [index, id] of ids.entries()) {
      must(await supabase.from('prepare_questions').update({ sort_order: index, is_priority: isPriority }).eq('id', id));
    }
  },

  'question.delete': async ({ id }) => {
    must(await supabase.from('prepare_questions').delete().eq('id', id));
  },

  'marker.create': async ({ row }) => {
    must(await supabase.from('intervention_markers').upsert(row, { onConflict: 'id', ignoreDuplicates: true }));
  },

  'marker.update': async ({ id, updates }) => {
    must(await supabase.from('intervention_markers').update(updates).eq('id', id));
  },

  'marker.delete': async ({ id }) => {
    must(await supabase.from('intervention_markers').delete().eq('id', id));
  },
};
