import type { CommandPayloads } from '@/lib/offline/commands';
import { pendingCommandsOf, pendingPayloads } from '@/lib/offline/outbox';
import type { BodyCheckIn, BodyEvent, BodyEventSite, BodyPainSite, CheckIn, PrepareQuestion, SleepLog } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

// What a screen read from the server, with the entries still waiting in the
// outbox laid over it — so a check-in answered offline shows as answered
// straight away, and doesn't come back as due (or get marked expired) on the
// next refresh just because the server hasn't heard about it yet.
//
// Applied in outbox order, which is the order the person made them in, so an
// edit queued after a completion wins.

export function overlayCheckIns(rows: CheckIn[]): CheckIn[] {
  const completes = pendingPayloads('checkIn.complete');
  const edits = pendingPayloads('checkIn.edit');
  const moves = pendingPayloads('checkIn.reschedule');
  if (completes.length === 0 && edits.length === 0 && moves.length === 0) return rows;

  return rows.map(row => {
    let next = row;
    for (const m of moves) {
      if (m.checkInId === row.id) next = { ...next, ...m.fields } as CheckIn;
    }
    for (const c of completes) {
      if (c.checkInId !== row.id) continue;
      next = {
        ...next,
        ...c.values,
        status: 'completed',
        completed_at: c.completedAt,
        ...(c.notes !== undefined ? { notes: c.notes } : {}),
        ...(c.lowDemand ? { low_demand: true } : {}),
      } as CheckIn;
    }
    for (const e of edits) {
      if (e.checkInId !== row.id) continue;
      next = {
        ...next,
        ...e.values,
        edited_at: e.editedAt,
        ...(e.notes !== undefined ? { notes: e.notes } : {}),
      } as CheckIn;
    }
    return next;
  });
}

/** Sleep logs with unsent scores merged in, one row per night. */
export function overlaySleepLogs(rows: SleepLog[], userId: string): SleepLog[] {
  const pending = pendingPayloads('sleep.save');
  if (pending.length === 0) return rows;
  const byDate = new Map(rows.map(r => [r.log_date, r]));
  for (const p of pending) {
    const existing = byDate.get(p.logDate);
    byDate.set(p.logDate, {
      ...(existing ?? { id: `pending-sleep-${p.logDate}`, user_id: userId, log_date: p.logDate, created_at: new Date().toISOString() }),
      ...p.fields,
    } as SleepLog);
  }
  return [...byDate.values()];
}

type EventWithSites = BodyEvent & { body_event_sites: BodyEventSite[] };

/**
 * Body check-ins, their pain sites and their events with unsent body entries
 * applied — the same result the server will hold once commands.ts's body
 * handlers have run, so History and Insights don't show a day logged offline
 * as empty.
 */
export function overlayBody(
  checkins: BodyCheckIn[],
  painSites: BodyPainSite[],
  events: EventWithSites[],
  userId: string,
): { checkins: BodyCheckIn[]; painSites: BodyPainSite[]; events: EventWithSites[] } {
  const saves = pendingPayloads('body.save');
  const upserts = pendingPayloads('body.upsert');
  if (saves.length === 0 && upserts.length === 0) return { checkins, painSites, events };

  const byDate = new Map(checkins.map(c => [c.entry_date, c]));
  let sites = painSites;
  let evs = events;
  const rowFor = (date: string) => byDate.get(date)
    ?? ({ id: `pending-body-${date}`, user_id: userId, entry_date: date } as BodyCheckIn);

  // Outbox order, so a later entry for the same day wins, as it will on the server.
  for (const c of pendingCommandsOf(['body.save', 'body.upsert'])) {
    if (c.type === 'body.upsert') {
      const p = c.payload as CommandPayloads['body.upsert'];
      if (p.insertOnly && byDate.has(p.entryDate)) continue;
      byDate.set(p.entryDate, { ...rowFor(p.entryDate), ...p.fields } as BodyCheckIn);
      continue;
    }
    const p = c.payload as CommandPayloads['body.save'];
    const row = { ...rowFor(p.entryDate), ...p.fields } as BodyCheckIn;
    byDate.set(p.entryDate, row);
    sites = [
      ...sites.filter(s => s.body_checkin_id !== row.id),
      ...p.painSites.map((s, i) => ({
        id: `pending-site-${p.entryDate}-${i}`, body_checkin_id: row.id, user_id: userId, ...s,
      }) as BodyPainSite),
    ];
    const ofDay = evs.filter(e => e.event_date === p.entryDate);
    const kept = ofDay.filter(e => !p.removedEventTypes.includes(e.event_type)
      && !p.events.some(pe => pe.type === e.event_type));
    const written = p.events.map(pe => {
      const server = ofDay.find(e => e.event_type === pe.type);
      const id = server?.id ?? pe.newId;
      return {
        ...(server ?? {
          id, user_id: userId, event_date: p.entryDate, event_type: pe.type,
          body_checkin_id: row.id, entered_retroactively: pe.retro, created_at: new Date().toISOString(),
        }),
        character: pe.character,
        body_event_sites: pe.sites.map((s, i) => ({ id: `${id}-site-${i}`, body_event_id: id, user_id: userId, ...s }) as BodyEventSite),
      } as EventWithSites;
    });
    evs = [...evs.filter(e => e.event_date !== p.entryDate), ...kept, ...written];
  }
  return { checkins: [...byDate.values()], painSites: sites, events: evs };
}

/** Markers with unsent creates, edits and deletes applied. */
export function overlayMarkers(rows: InterventionMarker[]): InterventionMarker[] {
  const commands = pendingCommandsOf(['marker.create', 'marker.update', 'marker.delete']);
  if (commands.length === 0) return rows;
  let out = rows;
  for (const c of commands) {
    if (c.type === 'marker.create') {
      const row = (c.payload as CommandPayloads['marker.create']).row as unknown as InterventionMarker;
      if (!out.some(m => m.id === row.id)) out = [...out, row];
    } else if (c.type === 'marker.update') {
      const { id, updates } = c.payload as CommandPayloads['marker.update'];
      out = out.map(m => (m.id === id ? { ...m, ...updates } as InterventionMarker : m));
    } else {
      const { id } = c.payload as CommandPayloads['marker.delete'];
      out = out.filter(m => m.id !== id);
    }
  }
  return out;
}

/** One appointment's questions with unsent changes applied, in display order
 *  (priority first, then sort_order) as the server query returns them. */
export function overlayQuestions(rows: PrepareQuestion[], appointmentId: string): PrepareQuestion[] {
  const commands = pendingCommandsOf(['question.create', 'question.update', 'question.reorder', 'question.delete']);
  if (commands.length === 0) return rows;
  let out = rows;
  for (const c of commands) {
    if (c.type === 'question.create') {
      const row = (c.payload as CommandPayloads['question.create']).row;
      if (row.appointment_id === appointmentId && !out.some(q => q.id === row.id)) {
        out = [...out, row as unknown as PrepareQuestion];
      }
    } else if (c.type === 'question.update') {
      const { id, updates } = c.payload as CommandPayloads['question.update'];
      out = out.map(q => (q.id === id ? { ...q, ...updates } as PrepareQuestion : q));
    } else if (c.type === 'question.reorder') {
      const { ids, isPriority } = c.payload as CommandPayloads['question.reorder'];
      out = out.map(q => {
        const index = ids.indexOf(q.id);
        return index === -1 ? q : { ...q, sort_order: index, is_priority: isPriority };
      });
    } else {
      const { id } = c.payload as CommandPayloads['question.delete'];
      out = out.filter(q => q.id !== id);
    }
  }
  return [...out].sort((a, b) =>
    Number(b.is_priority) - Number(a.is_priority) || a.sort_order - b.sort_order);
}

/** The profile with unsent profile changes applied, in the order made. */
export function overlayProfile<T extends object>(profile: T): T {
  const updates = pendingPayloads('profile.update');
  if (updates.length === 0) return profile;
  return updates.reduce((p, u) => ({ ...p, ...u.fields }), profile);
}

/** check_in_settings with unsent changes applied. Null stays null unless a
 *  change is waiting, which creates the row on the server too. */
export function overlayCheckInSettings<T extends object>(row: T | null): T | null {
  const updates = pendingPayloads('checkInSettings.upsert');
  if (updates.length === 0) return row;
  return updates.reduce((r, u) => ({ ...(r ?? {}), ...u.fields }) as T, row as T | null);
}

/** Current baselines with unsent ones applied: a newly set baseline replaces
 *  the domain's current one; seeds only fill domains that have none. */
export function overlayBaselines<T extends { domain: string; is_current?: boolean }>(rows: T[]): T[] {
  const commands = pendingCommandsOf(['baseline.set', 'baseline.seed']);
  if (commands.length === 0) return rows;
  let out = rows;
  for (const c of commands) {
    if (c.type === 'baseline.set') {
      const row = (c.payload as CommandPayloads['baseline.set']).row as unknown as T;
      out = [row, ...out.filter(b => b.domain !== row.domain)];
    } else {
      for (const r of (c.payload as CommandPayloads['baseline.seed']).rows as unknown as T[]) {
        if (!out.some(b => b.domain === r.domain)) out = [...out, r];
      }
    }
  }
  return out;
}

/** Patterns with unsent report flags applied. */
export function overlayClusters<T extends { id: string; flagged_for_report?: boolean }>(rows: T[]): T[] {
  const flags = pendingPayloads('cluster.flag');
  if (flags.length === 0) return rows;
  return rows.map(c => {
    const last = flags.filter(f => f.id === c.id).at(-1);
    return last ? { ...c, flagged_for_report: last.flagged } : c;
  });
}

/** Appointments with unsent creates, edits and deletes applied. */
export function overlayAppointments<T extends { id: string }>(rows: T[]): T[] {
  const commands = pendingCommandsOf(['appointment.create', 'appointment.update', 'appointment.delete']);
  if (commands.length === 0) return rows;
  let out = rows;
  for (const c of commands) {
    if (c.type === 'appointment.create') {
      const row = (c.payload as CommandPayloads['appointment.create']).row as unknown as T;
      if (!out.some(a => a.id === row.id)) out = [...out, row];
    } else if (c.type === 'appointment.update') {
      const { id, updates } = c.payload as CommandPayloads['appointment.update'];
      out = out.map(a => (a.id === id ? { ...a, ...updates } : a));
    } else {
      const { id } = c.payload as CommandPayloads['appointment.delete'];
      out = out.filter(a => a.id !== id);
    }
  }
  return out;
}

/** Bonus check-ins saved on this phone and not yet on the server, newest first. */
export function pendingBonusCheckIns(): CheckIn[] {
  return pendingPayloads('checkIn.bonus')
    .map(b => b.row as unknown as CheckIn)
    .reverse();
}
