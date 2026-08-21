// Ported from the web app's src/lib/detection/dataQualityChecks.ts, unchanged
// (including checkCircadianQuality, which nothing calls yet on native —
// circadian detection itself is deferred to a later Insights porting pass,
// this just doesn't cost anything to bring over now since it has no
// dependencies beyond debug.ts).
//
// These functions gate pattern creation: if data is insufficient the cluster
// is skipped entirely. Quality classification ('solid'/'partial'/'limited')
// is INTERNAL ONLY — it influences sort weight and subtle UI notes but is
// never surfaced as a raw label or percentage to the user.

import { debug } from '@/lib/debug';

const MS_PER_DAY = 86_400_000;

function daysBetween(a: string | Date, b: string | Date): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY);
}

export interface DataQualityCheck {
  isValid: boolean;
  dataQuality: 'solid' | 'partial' | 'limited';
  actualPoints: number;
  expectedPoints: number;
}

/**
 * Validates data quality for sustained deviation detection.
 * VALIDATION RULES:
 * - Completion rate (actualCheckIns / streakDays × checkInsPerDay) must be ≥40%
 * - Average check-ins per day must be ≥1.5
 * QUALITY CLASSIFICATION (internal only):
 * - solid  : ≥75% coverage AND ≥2 pts/day
 * - partial: ≥50% coverage
 * - limited: 40–49% coverage (minimum acceptable)
 */
export function checkSustainedDeviationQuality(checkInsInPeriod: number, streakDays: number, checkInsPerDay: number): DataQualityCheck {
  const expectedPoints = streakDays * Math.max(checkInsPerDay, 1);
  const actualPoints = checkInsInPeriod;
  const coveragePct = (actualPoints / expectedPoints) * 100;
  const avgPerDay = actualPoints / Math.max(streakDays, 1);

  if (coveragePct < 40 || avgPerDay < 1.5) {
    debug.log('Data Quality', 'Sustained deviation rejected:', {
      actualPoints,
      expectedPoints,
      coveragePct: coveragePct.toFixed(1) + '%',
      avgPerDay: avgPerDay.toFixed(2),
      reason: 'insufficient coverage or density',
    });
    return { isValid: false, dataQuality: 'limited', actualPoints, expectedPoints };
  }

  let dataQuality: 'solid' | 'partial' | 'limited';
  if (coveragePct >= 75 && avgPerDay >= 2) {
    dataQuality = 'solid';
  } else if (coveragePct >= 50) {
    dataQuality = 'partial';
  } else {
    dataQuality = 'limited';
  }

  debug.log('Data Quality', 'Sustained deviation accepted:', { quality: dataQuality, actualPoints, coveragePct: coveragePct.toFixed(1) + '%' });

  return { isValid: true, dataQuality, actualPoints, expectedPoints };
}

/**
 * Validates data quality for rapid cycling (weekly oscillation) detection.
 * VALIDATION RULES:
 * - Must have data on ≥5 of the 7 days in the window
 * - No gap of >2 consecutive missing days
 */
export function checkRapidCyclingQuality(windowDates: string[], windowDays: number): DataQualityCheck {
  const daysWithData = windowDates.length;
  const expectedPoints = windowDays;

  if (daysWithData < 5) {
    debug.log('Data Quality', 'Rapid cycling rejected:', { daysWithData, expectedPoints, reason: 'fewer than 5 days with data' });
    return { isValid: false, dataQuality: 'limited', actualPoints: daysWithData, expectedPoints };
  }

  const sorted = [...windowDates].sort();
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1], sorted[i]);
    if (gap > 2) {
      debug.log('Data Quality', 'Rapid cycling rejected:', { daysWithData, gap, reason: 'gap > 2 consecutive days' });
      return { isValid: false, dataQuality: 'limited', actualPoints: daysWithData, expectedPoints };
    }
  }

  const coveragePct = (daysWithData / windowDays) * 100;
  const dataQuality = coveragePct >= 85 ? 'solid' : 'partial';

  debug.log('Data Quality', 'Rapid cycling accepted:', { quality: dataQuality, daysWithData });

  return { isValid: true, dataQuality, actualPoints: daysWithData, expectedPoints };
}

/**
 * Validates data quality for circadian pattern detection. Not called yet on
 * native (circadian detection itself is a later porting pass) — ported now
 * since it's free (no extra deps) and keeps this file a complete port of
 * the source rather than a partial one.
 */
export function checkCircadianQuality(domainCheckIns: unknown[], blockData: Record<string, number[]>): DataQualityCheck {
  const totalCheckIns = domainCheckIns.length;

  if (totalCheckIns < 30) {
    return { isValid: false, dataQuality: 'limited', actualPoints: totalCheckIns, expectedPoints: 30 };
  }

  const uniqueDates = new Set(
    domainCheckIns.map(c => {
      const row = c as { scheduled_date?: string; scheduled_at: string };
      return row.scheduled_date ?? new Date(row.scheduled_at).toLocaleDateString('en-CA');
    }),
  );

  if (uniqueDates.size < 10) {
    debug.log('Data Quality', 'Circadian rejected: fewer than 10 distinct days', { uniqueDates: uniqueDates.size });
    return { isValid: false, dataQuality: 'limited', actualPoints: uniqueDates.size, expectedPoints: 10 };
  }

  const sortedDates = Array.from(uniqueDates).sort();
  const spanDays = daysBetween(sortedDates[0], sortedDates[sortedDates.length - 1]);
  const weekSpan = spanDays / 7;

  if (weekSpan < 3) {
    debug.log('Data Quality', 'Circadian rejected: data spans < 3 weeks', { spanDays, weekSpan: weekSpan.toFixed(1) });
    return { isValid: false, dataQuality: 'limited', actualPoints: Math.floor(weekSpan), expectedPoints: 3 };
  }

  for (const [blockName, scores] of Object.entries(blockData)) {
    if (scores.length > 0 && scores.length < 5) {
      debug.log('Data Quality', 'Circadian rejected: block has < 5 data points', { blockName, count: scores.length });
      return { isValid: false, dataQuality: 'limited', actualPoints: scores.length, expectedPoints: 5 };
    }
  }

  debug.log('Data Quality', 'Circadian accepted:', { totalCheckIns, uniqueDays: uniqueDates.size });
  return { isValid: true, dataQuality: 'solid', actualPoints: totalCheckIns, expectedPoints: 30 };
}
