import { addDays } from '@/lib/date-utils';
import { debug } from '@/lib/debug';
import { BodyDomainType, DomainType } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

// Ported from the web app's src/lib/detection/interventionImpact.ts.
// Widened to cover body domains too (mind+body day-score merge pass) —
// already domain-agnostic (a generic loop over activeDomains, no mind-
// specific logic), so this is a type-level unlock only.
export type TrackedFactor = DomainType | BodyDomainType;

export interface DomainImpact {
  domain: TrackedFactor;
  before_avg: number;
  after_avg: number;
  change: number;
  direction: 'increased' | 'decreased';
  window_days: 7 | 14 | 21;
}

export interface InterventionImpact {
  marker_id: string;
  marker_type: 'medication' | 'therapy';
  marker_date: string;
  marker_label: string;
  affected_domains: DomainImpact[];
  data_quality: 'solid' | 'partial';
  before_day_count: number;
  after_day_count: number;
}

interface DayScores {
  date: string;
  scores: Partial<Record<TrackedFactor | 'sleep', number>>;
}

const MIN_DAYS = 7;
const MIN_DOMAIN_SCORES = 5;
const MIN_CHANGE = 1.5;
const SOLID_DAYS = 10;
const MAX_RESULTS = 3;
const WINDOWS: (7 | 14 | 21)[] = [14, 7, 21];

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function detectInterventionImpacts(markers: InterventionMarker[], days: DayScores[], activeDomains: TrackedFactor[]): InterventionImpact[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const dataStart = sorted[0].date;
  const dataEnd = sorted[sorted.length - 1].date;

  const eligible = markers.filter(m => m.marker_type === 'medication' || m.marker_type === 'therapy').sort((a, b) => b.marker_date.localeCompare(a.marker_date));

  const results: InterventionImpact[] = [];

  for (const marker of eligible) {
    if (results.length >= MAX_RESULTS) break;

    let best: InterventionImpact | null = null;

    for (const w of WINDOWS) {
      const beforeStart = addDays(marker.marker_date, -w);
      const afterEnd = addDays(marker.marker_date, w);

      if (afterEnd < dataStart || beforeStart > dataEnd) continue;

      const beforeDays = sorted.filter(d => d.date >= beforeStart && d.date < marker.marker_date);
      const afterDays = sorted.filter(d => d.date > marker.marker_date && d.date <= afterEnd);

      if (beforeDays.length < MIN_DAYS || afterDays.length < MIN_DAYS) continue;

      const affected: DomainImpact[] = [];

      for (const domain of activeDomains) {
        const bScores = beforeDays.map(d => d.scores[domain]).filter((s): s is number => s !== undefined);
        const aScores = afterDays.map(d => d.scores[domain]).filter((s): s is number => s !== undefined);
        if (bScores.length < MIN_DOMAIN_SCORES || aScores.length < MIN_DOMAIN_SCORES) continue;

        const bAvg = mean(bScores);
        const aAvg = mean(aScores);
        const change = aAvg - bAvg;
        if (Math.abs(change) < MIN_CHANGE) continue;

        affected.push({ domain, before_avg: bAvg, after_avg: aAvg, change, direction: change > 0 ? 'increased' : 'decreased', window_days: w });
      }

      if (affected.length === 0) continue;

      const dq: 'solid' | 'partial' = beforeDays.length >= SOLID_DAYS && afterDays.length >= SOLID_DAYS ? 'solid' : 'partial';

      const candidate: InterventionImpact = {
        marker_id: marker.id,
        marker_type: marker.marker_type as 'medication' | 'therapy',
        marker_date: marker.marker_date,
        marker_label: marker.label,
        affected_domains: affected.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
        data_quality: dq,
        before_day_count: beforeDays.length,
        after_day_count: afterDays.length,
      };

      const totalNew = beforeDays.length + afterDays.length;
      const totalBest = best ? best.before_day_count + best.after_day_count : 0;

      if (!best || (dq === 'solid' && best.data_quality !== 'solid') || (dq === best.data_quality && totalNew > totalBest)) {
        best = candidate;
      }
    }

    if (best) results.push(best);
  }

  debug.log('InterventionImpact', `Detected ${results.length} impacts`);
  return results;
}
