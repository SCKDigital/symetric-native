import { debug } from '@/lib/debug';
import { DomainType } from '@/lib/supabase';

/**
 * Rare-event detection — statistically infrequent day-shapes, not clinical
 * significance. A day (or short run of days) qualifies purely by how seldom
 * it occurs relative to the user's own tracked history (≤3 times in <60 days
 * of data, ≤6 times in ≥60 days — see isRare()), regardless of whether the
 * deviation is sustained, resolves quickly, or is otherwise clinically
 * notable. Surfaced on Insights as "Rare days".
 *
 * Contrast with cluster-detection.ts, which flags multi-day sustained or
 * cycling deviations from personal baseline for the "Worth Discussing With
 * Your Doctor" section — those qualify by duration/pattern shape, not
 * rarity, and can occur frequently and still be surfaced there.
 *
 * Ported from the web app's src/lib/detection/rareEvents.ts — mind-only for
 * now, same TrackedFactor note as the other detection modules in this
 * Insights chunk series.
 */
export type TrackedFactor = DomainType;

export interface RareEvent {
  event_type: 'consecutive_poor_sleep' | 'all_elevated' | 'all_suppressed' | 'extreme_spike' | 'multi_crash';
  occurrence_dates: string[];
  frequency: number;
  affected_domains: TrackedFactor[];
  consequence_pattern?: string;
  clinical_note: string;
}

interface DayScores {
  date: string;
  scores: Partial<Record<TrackedFactor | 'sleep', number>>;
}

const MIN_SPAN_DAYS = 30;
const MAX_RESULTS = 3;

function isRare(count: number, spanDays: number): boolean {
  return spanDays >= 60 ? count <= 6 : count <= 3;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

interface ScoredEvent {
  event: RareEvent;
  score: number;
}

export function detectRareEvents(days: DayScores[], activeDomains: TrackedFactor[], baselines: Partial<Record<TrackedFactor | 'sleep', number>>): RareEvent[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const spanDays = Math.round((new Date(sorted[sorted.length - 1].date + 'T12:00:00Z').getTime() - new Date(sorted[0].date + 'T12:00:00Z').getTime()) / 86_400_000);
  if (spanDays < MIN_SPAN_DAYS) return [];

  const candidates: ScoredEvent[] = [];

  // ── 1. Consecutive poor sleep (≤2/5 for 3+ days) ──────────────────────────
  const sleepDays = sorted.filter(d => d.scores['sleep'] !== undefined);
  if (sleepDays.length >= 10) {
    const sequences: string[][] = [];
    let run: string[] = [];

    for (const day of sleepDays) {
      if (day.scores['sleep']! <= 2) {
        run.push(day.date);
      } else {
        if (run.length >= 3) sequences.push([...run]);
        run = [];
      }
    }
    if (run.length >= 3) sequences.push(run);

    if (sequences.length > 0 && isRare(sequences.length, spanDays)) {
      const spikeCount = sequences.filter(seq => {
        const seqEnd = seq[seq.length - 1];
        const afterIdx = sorted.findIndex(d => d.date > seqEnd);
        if (afterIdx < 0) return false;
        const afterDays = sorted.slice(afterIdx, afterIdx + 3);
        return activeDomains.some(domain => {
          const durScores = sorted
            .filter(d => d.date >= seq[0] && d.date <= seqEnd)
            .map(d => d.scores[domain])
            .filter((s): s is number => s !== undefined);
          const aftScores = afterDays.map(d => d.scores[domain]).filter((s): s is number => s !== undefined);
          if (!durScores.length || !aftScores.length) return false;
          return mean(aftScores) > mean(durScores) + 1.0;
        });
      }).length;

      const consequence = spikeCount > 0 ? `symptoms shifted in ${spikeCount} of ${sequences.length} instance${sequences.length !== 1 ? 's' : ''} afterward` : undefined;

      candidates.push({
        score: 4,
        event: {
          event_type: 'consecutive_poor_sleep',
          occurrence_dates: sequences.map(s => s[0]),
          frequency: sequences.length,
          affected_domains: [],
          consequence_pattern: consequence,
          clinical_note: `Sleep at or below 2/5 for 3+ consecutive days - occurred ${sequences.length} time${sequences.length !== 1 ? 's' : ''}`,
        },
      });
    }
  }

  // ── 2. All domains elevated simultaneously (all ≥7) ───────────────────────
  if (activeDomains.length >= 2) {
    const elevatedDays = sorted.filter(d =>
      activeDomains.every(domain => {
        const s = d.scores[domain];
        return s !== undefined && s >= 7;
      }),
    );
    if (elevatedDays.length > 0 && isRare(elevatedDays.length, spanDays)) {
      candidates.push({
        score: 5,
        event: {
          event_type: 'all_elevated',
          occurrence_dates: elevatedDays.map(d => d.date),
          frequency: elevatedDays.length,
          affected_domains: activeDomains,
          clinical_note: `All tracked domains elevated simultaneously - occurred ${elevatedDays.length === 1 ? 'once' : `${elevatedDays.length} times`}`,
        },
      });
    }
  }

  // ── 3. All domains suppressed simultaneously (all ≤3) ─────────────────────
  if (activeDomains.length >= 2) {
    const suppressedDays = sorted.filter(d =>
      activeDomains.every(domain => {
        const s = d.scores[domain];
        return s !== undefined && s <= 3;
      }),
    );
    if (suppressedDays.length > 0 && isRare(suppressedDays.length, spanDays)) {
      candidates.push({
        score: 5,
        event: {
          event_type: 'all_suppressed',
          occurrence_dates: suppressedDays.map(d => d.date),
          frequency: suppressedDays.length,
          affected_domains: activeDomains,
          clinical_note: `All tracked domains suppressed simultaneously - occurred ${suppressedDays.length === 1 ? 'once' : `${suppressedDays.length} times`}`,
        },
      });
    }
  }

  // ── 4. Extreme single-domain spikes (≥3 pts from baseline) ───────────────
  for (const domain of activeDomains) {
    const baseline = baselines[domain] ?? 5;
    const spikeDays = sorted.filter(d => {
      const s = d.scores[domain];
      return s !== undefined && Math.abs(s - baseline) >= 3;
    });
    if (spikeDays.length > 0 && isRare(spikeDays.length, spanDays)) {
      candidates.push({
        score: 3,
        event: {
          event_type: 'extreme_spike',
          occurrence_dates: spikeDays.map(d => d.date),
          frequency: spikeDays.length,
          affected_domains: [domain],
          clinical_note: `${domain} reached >=3 points from personal baseline - occurred ${spikeDays.length} time${spikeDays.length !== 1 ? 's' : ''}`,
        },
      });
    }
  }

  // ── 5. Multi-domain crash (≥3 domains drop ≥2 pts vs 48h earlier) ─────────
  const crashDates: string[] = [];
  for (let i = 2; i < sorted.length; i++) {
    const now = sorted[i];
    const then = sorted[i - 2];
    const crashing = activeDomains.filter(domain => {
      const nScore = now.scores[domain];
      const tScore = then.scores[domain];
      return nScore !== undefined && tScore !== undefined && tScore - nScore >= 2;
    });
    if (crashing.length >= 3) crashDates.push(now.date);
  }
  const uniqueCrashDates = [...new Set(crashDates)];
  if (uniqueCrashDates.length > 0 && isRare(uniqueCrashDates.length, spanDays)) {
    candidates.push({
      score: 4,
      event: {
        event_type: 'multi_crash',
        occurrence_dates: uniqueCrashDates,
        frequency: uniqueCrashDates.length,
        affected_domains: activeDomains,
        clinical_note: `3+ tracked domains dropped 2+ points within 48 hours - occurred ${uniqueCrashDates.length} time${uniqueCrashDates.length !== 1 ? 's' : ''}`,
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const results = candidates.map(c => c.event).slice(0, MAX_RESULTS);
  debug.log('RareEvents', `Detected ${results.length} rare events`);
  return results;
}
