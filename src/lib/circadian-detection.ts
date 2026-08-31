import { debug } from '@/lib/debug';
import { checkCircadianQuality } from '@/lib/detection/data-quality-checks';
import { supabase } from '@/lib/supabase';

// Ported from the web app's src/lib/circadianDetection.ts, unchanged — pure
// logic + Supabase reads/writes, no DOM dependency. This closes the gap
// `cluster-detection.ts` deliberately left in chunk 1 of the Insights port
// (the web's `runClusterDetection` calls `detectCircadianPatterns` inline;
// see that file for where the call is now wired back in).

const TIME_BLOCKS = [
  { name: 'morning' as const, startPercent: 0, endPercent: 25 },
  { name: 'midday' as const, startPercent: 25, endPercent: 50 },
  { name: 'afternoon' as const, startPercent: 50, endPercent: 75 },
  { name: 'evening' as const, startPercent: 75, endPercent: 100 },
];

const DOMAINS = ['mood', 'energy', 'anxiety', 'concentration', 'irritability', 'social_battery', 'sensory_sensitivity', 'motivation'] as const;

export interface CircadianPattern {
  id?: string;
  user_id?: string;
  domain: string;
  morning_avg: number | null;
  morning_count: number;
  midday_avg: number | null;
  midday_count: number;
  afternoon_avg: number | null;
  afternoon_count: number;
  evening_avg: number | null;
  evening_count: number;
  total_checkins: number;
  highest_block: string;
  lowest_block: string;
  range: number;
  detection_window_start: string;
  detection_window_end: string;
  created_at?: string;
  updated_at?: string;
}

function getTimeBlock(scheduledAt: string, windowStart: string, windowEnd: string, timezone: string): 'morning' | 'midday' | 'afternoon' | 'evening' | null {
  const scheduled = new Date(scheduledAt);
  const localTime = scheduled.toLocaleString('en-US', { timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit' });

  const [windowStartHour, windowStartMin] = windowStart.split(':').map(Number);
  const [windowEndHour, windowEndMin] = windowEnd.split(':').map(Number);
  const timeParts = localTime.split(':').map(Number);
  const checkHour = timeParts[0] === 24 ? 0 : timeParts[0];
  const checkMin = timeParts[1];

  const windowStartMins = windowStartHour * 60 + windowStartMin;
  const windowEndMins = windowEndHour * 60 + windowEndMin;
  const checkMins = checkHour * 60 + checkMin;

  if (checkMins < windowStartMins || checkMins > windowEndMins) return null;

  const windowDuration = windowEndMins - windowStartMins;
  if (windowDuration <= 0) return null;

  const positionInWindow = ((checkMins - windowStartMins) / windowDuration) * 100;

  const block = TIME_BLOCKS.find(b => positionInWindow >= b.startPercent && positionInWindow < b.endPercent);

  if (!block && positionInWindow >= 100) return 'evening';
  return block?.name ?? null;
}

const MIN_TOTAL_CHECKINS = 30;

export async function detectCircadianPatterns(userId: string): Promise<void> {
  const [{ data: settings }, { data: profile }] = await Promise.all([
    supabase.from('check_in_settings').select('window_start, window_end').eq('user_id', userId).single(),
    supabase.from('profiles').select('timezone').eq('id', userId).single(),
  ]);

  if (!settings || !profile?.timezone) return;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: checkIns } = await supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('scheduled_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('scheduled_at', { ascending: true });

  if (!checkIns || checkIns.length === 0) return;

  const blockData: Record<string, Record<string, number[]>> = {};
  DOMAINS.forEach(domain => {
    blockData[domain] = { morning: [], midday: [], afternoon: [], evening: [] };
  });

  checkIns.forEach(ci => {
    const block = getTimeBlock(ci.scheduled_at, settings.window_start, settings.window_end, profile.timezone);
    if (!block) return;
    DOMAINS.forEach(domain => {
      const score = ci[domain];
      if (score !== null && score !== undefined) {
        blockData[domain][block].push(score as number);
      }
    });
  });

  const windowEnd = new Date().toISOString().split('T')[0];
  const windowStart = thirtyDaysAgo.toISOString().split('T')[0];

  const patterns: Omit<CircadianPattern, 'id' | 'created_at' | 'updated_at'>[] = [];

  DOMAINS.forEach(domain => {
    const blocks = blockData[domain];

    const blockStats: Record<string, { avg: number | null; count: number }> = {
      morning: { avg: null, count: 0 },
      midday: { avg: null, count: 0 },
      afternoon: { avg: null, count: 0 },
      evening: { avg: null, count: 0 },
    };

    let totalCheckins = 0;

    Object.entries(blocks).forEach(([blockName, scores]) => {
      blockStats[blockName].count = scores.length;
      totalCheckins += scores.length;

      if (scores.length > 0) {
        blockStats[blockName].avg = Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
      }
    });

    const domainCheckIns = checkIns.filter(ci => {
      const score = ci[domain];
      return score !== null && score !== undefined;
    });
    const qualityCheck = checkCircadianQuality(domainCheckIns, blocks);
    if (!qualityCheck.isValid) {
      debug.log('Data Quality', `Skipping circadian detection for ${domain}:`, { actualPoints: qualityCheck.actualPoints, expectedPoints: qualityCheck.expectedPoints });
      return;
    }

    if (totalCheckins < MIN_TOTAL_CHECKINS) return;

    const validBlocks = Object.entries(blockStats)
      .filter(([, stats]) => stats.avg !== null)
      .map(([name, stats]) => ({ name, avg: stats.avg! }));

    if (validBlocks.length < 2) return;

    validBlocks.sort((a, b) => b.avg - a.avg);
    const highestBlock = validBlocks[0];
    const lowestBlock = validBlocks[validBlocks.length - 1];
    const range = Math.round((highestBlock.avg - lowestBlock.avg) * 10) / 10;

    patterns.push({
      user_id: userId,
      domain,
      morning_avg: blockStats.morning.avg,
      morning_count: blockStats.morning.count,
      midday_avg: blockStats.midday.avg,
      midday_count: blockStats.midday.count,
      afternoon_avg: blockStats.afternoon.avg,
      afternoon_count: blockStats.afternoon.count,
      evening_avg: blockStats.evening.avg,
      evening_count: blockStats.evening.count,
      total_checkins: totalCheckins,
      highest_block: highestBlock.name,
      lowest_block: lowestBlock.name,
      range,
      detection_window_start: windowStart,
      detection_window_end: windowEnd,
    });
  });

  patterns.sort((a, b) => b.range - a.range);

  if (patterns.length > 0) {
    const { error: upsertError } = await supabase.from('circadian_patterns').upsert(patterns, { onConflict: 'user_id,domain' });
    if (upsertError) {
      debug.error('Circadian Detection', 'Upsert error:', upsertError);
      throw new Error(`circadian upsert failed: ${upsertError.message}`);
    }

    const qualifyingDomains = patterns.map(p => p.domain);
    await supabase
      .from('circadian_patterns')
      .delete()
      .eq('user_id', userId)
      .not('domain', 'in', `(${qualifyingDomains.join(',')})`);
  } else {
    const { error: deleteError } = await supabase.from('circadian_patterns').delete().eq('user_id', userId);
    if (deleteError) {
      debug.error('Circadian Detection', 'Delete error:', deleteError);
      throw new Error(`circadian delete failed: ${deleteError.message}`);
    }
  }
}

export async function fetchCircadianPatterns(userId: string, from: string = '2000-01-01'): Promise<CircadianPattern[]> {
  const { data, error } = await supabase.from('circadian_patterns').select('*').eq('user_id', userId).gte('detection_window_end', from).order('range', { ascending: false });

  if (error) {
    debug.error('Circadian Detection', 'Error fetching patterns:', error);
    return [];
  }

  return data ?? [];
}

export function formatCircadianPattern(pattern: CircadianPattern): {
  domain: string;
  blocks: { name: string; avg: number; count: number }[];
  totalCheckins: number;
  range: number;
} {
  const domain = pattern.domain.charAt(0).toUpperCase() + pattern.domain.slice(1).replace('_', ' ');

  const allBlocks = [
    { name: 'Morning', avg: pattern.morning_avg, count: pattern.morning_count },
    { name: 'Midday', avg: pattern.midday_avg, count: pattern.midday_count },
    { name: 'Afternoon', avg: pattern.afternoon_avg, count: pattern.afternoon_count },
    { name: 'Evening', avg: pattern.evening_avg, count: pattern.evening_count },
  ];

  const blocks = allBlocks.filter((b): b is { name: string; avg: number; count: number } => b.avg !== null);

  return { domain, blocks, totalCheckins: pattern.total_checkins, range: pattern.range };
}

/**
 * Check if circadian_available milestone conditions are met:
 *   - At least 1 domain in circadian_patterns with range ≥ 2.0
 *   - At least 30 completed check-ins total
 * Inserts the milestone record if newly achieved. Returns true if milestone should be shown.
 */
export async function check30DayMilestone(userId: string): Promise<boolean> {
  const { data: existing } = await supabase.from('milestones_achieved').select('id').eq('user_id', userId).eq('milestone_type', 'circadian_available').maybeSingle();

  if (existing) return false;

  const { data: circadianData } = await supabase.from('circadian_patterns').select('domain').eq('user_id', userId).gte('range', 2.0).limit(1).maybeSingle();

  if (!circadianData) return false;

  const { count } = await supabase.from('check_ins').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed');

  if ((count ?? 0) < 30) return false;

  await supabase.from('milestones_achieved').insert({ user_id: userId, milestone_type: 'circadian_available' });
  return true;
}
