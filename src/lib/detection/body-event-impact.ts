// Ported from the web app's src/lib/detection/bodyEventImpact.ts, unchanged.
//
// Cross-area: does a physical event (crash, subluxation, presyncope...)
// coincide with a shift in mind-domain scores in the days after? Same
// before/after windowing idea as intervention-impact.ts, but the "marker" is
// a body event rather than a medication/therapy change, so the windows are
// shorter — acute physical events plausibly have a shorter-lived
// psychological echo than a medication change, and there are usually more
// event occurrences to pool than there are medication changes.

import type { DomainType, BodyEventType } from '@/lib/supabase';

export interface BodyEventMindImpact {
  eventType: BodyEventType;
  occurrenceCount: number;
  affectedDomains: {
    domain: DomainType;
    beforeAvg: number;
    afterAvg: number;
    change: number;
    direction: 'increased' | 'decreased';
  }[];
  dataQuality: 'solid' | 'partial';
  windowDays: 3 | 7;
  beforeDayCount: number;
  afterDayCount: number;
}

interface DayScores {
  date: string;
  scores: Partial<Record<DomainType, number>>;
}

export interface BodyEventOccurrence {
  event_date: string;
  event_type: BodyEventType;
}

const WINDOWS: (3 | 7)[] = [7, 3];
const MIN_DAYS = 2;
const MIN_DOMAIN_SCORES = 2;
const MIN_CHANGE = 1.0;
const SOLID_DAYS = 5;
const MIN_OCCURRENCES = 2;
const MAX_RESULTS = 3;

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function addDaysStr(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString('en-CA');
}

/**
 * Pools before/after mind-domain scores across every occurrence of a body
 * event type within `days`, rather than evaluating one occurrence at a time
 * (unlike intervention-impact.ts's per-marker approach) — body events recur
 * often enough that a single occurrence rarely has enough surrounding data
 * on its own, but the pattern across occurrences does.
 */
export function detectBodyEventImpacts(
  occurrences: BodyEventOccurrence[],
  days: DayScores[],
  activeDomains: DomainType[],
): BodyEventMindImpact[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const dataStart = sorted[0].date;
  const dataEnd = sorted[sorted.length - 1].date;
  const dateMap = new Map(sorted.map(d => [d.date, d]));

  const byType = new Map<BodyEventType, string[]>();
  for (const o of occurrences) {
    if (!byType.has(o.event_type)) byType.set(o.event_type, []);
    byType.get(o.event_type)!.push(o.event_date);
  }

  const results: BodyEventMindImpact[] = [];

  for (const [eventType, dates] of byType.entries()) {
    if (results.length >= MAX_RESULTS) break;
    if (dates.length < MIN_OCCURRENCES) continue;

    let best: BodyEventMindImpact | null = null;

    for (const w of WINDOWS) {
      // Pool before/after day-scores across every occurrence of this event
      // type. A day can appear in more than one occurrence's window if
      // events recur close together — accepted as a known limitation,
      // consistent with how clustered events are treated elsewhere in this
      // codebase (e.g. rare-events.ts's consequence-window checks).
      const beforeDates = new Set<string>();
      const afterDates = new Set<string>();

      for (const eventDate of dates) {
        if (eventDate < dataStart || eventDate > dataEnd) continue;
        for (let i = 1; i <= w; i++) {
          const before = addDaysStr(eventDate, -i);
          if (before >= dataStart && dateMap.has(before)) beforeDates.add(before);
          const after = addDaysStr(eventDate, i);
          if (after <= dataEnd && dateMap.has(after)) afterDates.add(after);
        }
        // A day the event itself occurred on isn't "before" or "after" —
        // exclude it from both buckets if it slipped in via another occurrence's window.
        beforeDates.delete(eventDate);
        afterDates.delete(eventDate);
      }

      if (beforeDates.size < MIN_DAYS || afterDates.size < MIN_DAYS) continue;

      const affected: BodyEventMindImpact['affectedDomains'] = [];

      for (const domain of activeDomains) {
        const bScores = [...beforeDates].map(d => dateMap.get(d)!.scores[domain]).filter((s): s is number => s !== undefined);
        const aScores = [...afterDates].map(d => dateMap.get(d)!.scores[domain]).filter((s): s is number => s !== undefined);
        if (bScores.length < MIN_DOMAIN_SCORES || aScores.length < MIN_DOMAIN_SCORES) continue;

        const bAvg = mean(bScores);
        const aAvg = mean(aScores);
        const change = aAvg - bAvg;
        if (Math.abs(change) < MIN_CHANGE) continue;

        affected.push({
          domain, beforeAvg: bAvg, afterAvg: aAvg, change,
          direction: change > 0 ? 'increased' : 'decreased',
        });
      }

      if (affected.length === 0) continue;

      const dq: 'solid' | 'partial' = beforeDates.size >= SOLID_DAYS && afterDates.size >= SOLID_DAYS ? 'solid' : 'partial';

      const candidate: BodyEventMindImpact = {
        eventType,
        occurrenceCount: dates.length,
        affectedDomains: affected.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
        dataQuality: dq,
        windowDays: w,
        beforeDayCount: beforeDates.size,
        afterDayCount: afterDates.size,
      };

      const totalNew = beforeDates.size + afterDates.size;
      const totalBest = best ? best.beforeDayCount + best.afterDayCount : 0;
      if (!best || (dq === 'solid' && best.dataQuality !== 'solid') || (dq === best.dataQuality && totalNew >= totalBest)) {
        best = candidate;
      }
    }

    if (best) results.push(best);
  }

  return results.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}
