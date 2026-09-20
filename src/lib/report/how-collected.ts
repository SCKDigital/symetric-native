import type { CheckIn } from '@/lib/supabase';

// Facts about how the record was made, as opposed to what it says.
//
// Two of them, and both change how a reader should weigh everything else:
//
// One-tap answers. Comfort mode offers "Nothing unusual today", which writes a
// real check-in with every slider resting at that domain's own baseline and
// low_demand set. Cluster detection reads the flag and caps a finding's
// confidence at partial, but nothing in the report has ever said so. A
// fortnight logged entirely by one tap therefore renders as a fortnight of
// considered answers that happened to sit flat — and one-tap logging is used
// most in the worst weeks, which are the weeks a clinician is asking about.
// A flare recorded that way currently reads as calm.
//
// When the misses fall. The weekly completion table reports that 39% of a
// week's check-ins were answered and stops there, which invites a reader to
// discount the week as unreliable. If every one of those misses was a morning
// slot and every evening slot was answered, that is not unreliability, it is
// a finding — being unable to answer anything before noon is the symptom.

export type TimeBlock = 'morning' | 'midday' | 'afternoon' | 'evening';

export const TIME_BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** Same four blocks the circadian detector uses, so the report never has two
 *  different ideas of when the morning ends. */
export function timeBlockForHour(hour: number): TimeBlock {
  if (hour < 12) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function hourInZone(iso: string, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).formatToParts(new Date(iso));
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  } catch {
    return new Date(iso).getHours();
  }
}

export interface OneTapSummary {
  completed: number;
  oneTap: number;
  /** Share of completed check-ins answered with one tap, 0-1. */
  share: number;
}

export function summariseOneTap(checkIns: CheckIn[]): OneTapSummary {
  const completed = checkIns.filter(c => c.status === 'completed');
  const oneTap = completed.filter(c => c.low_demand === true).length;
  return {
    completed: completed.length,
    oneTap,
    share: completed.length > 0 ? oneTap / completed.length : 0,
  };
}

export interface MissedByTimeOfDay {
  missed: number;
  scheduled: number;
  byBlock: Record<TimeBlock, { missed: number; scheduled: number }>;
  /** The block holding most of the misses, when one clearly does. */
  standout: { block: TimeBlock; missed: number; missRate: number } | null;
}

/**
 * Where in the day the unanswered check-ins fall.
 *
 * Counted against the slots actually scheduled in each block, not against the
 * misses alone: three missed mornings out of three is a different statement
 * from three out of twelve, and only the first is worth a clinician's
 * attention. A standout needs at least four missed slots in the block and a
 * miss rate at least 25 points above the rest of the day, so an ordinary
 * scatter of skipped check-ins never gets dressed up as a symptom.
 */
export function summariseMissedByTimeOfDay(allCheckIns: CheckIn[], timezone: string): MissedByTimeOfDay {
  const byBlock: Record<TimeBlock, { missed: number; scheduled: number }> = {
    morning: { missed: 0, scheduled: 0 },
    midday: { missed: 0, scheduled: 0 },
    afternoon: { missed: 0, scheduled: 0 },
    evening: { missed: 0, scheduled: 0 },
  };

  let missed = 0;
  let scheduled = 0;

  for (const ci of allCheckIns) {
    // A bonus check-in was never scheduled, so it cannot be missed.
    if (!ci.scheduled_date) continue;
    const block = timeBlockForHour(hourInZone(ci.scheduled_at, timezone));
    byBlock[block].scheduled++;
    scheduled++;
    if (ci.status !== 'completed') {
      byBlock[block].missed++;
      missed++;
    }
  }

  let standout: MissedByTimeOfDay['standout'] = null;
  for (const block of Object.keys(byBlock) as TimeBlock[]) {
    const here = byBlock[block];
    if (here.missed < 4 || here.scheduled === 0) continue;
    const elsewhereScheduled = scheduled - here.scheduled;
    const elsewhereMissed = missed - here.missed;
    const hereRate = here.missed / here.scheduled;
    const elsewhereRate = elsewhereScheduled > 0 ? elsewhereMissed / elsewhereScheduled : 0;
    if (hereRate - elsewhereRate < 0.25) continue;
    if (standout && standout.missRate >= hereRate) continue;
    standout = { block, missed: here.missed, missRate: hereRate };
  }

  return { missed, scheduled, byBlock, standout };
}
