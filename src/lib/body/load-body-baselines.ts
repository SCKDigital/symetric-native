import { CHECKIN_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { addDays, todayDateString } from '@/lib/date-utils';
import { rollingBodyBaseline } from '@/lib/detection/body-baseline';
import { dailyBodyValue } from '@/lib/detection/body-daily-value';
import { readCache, writeCache } from '@/lib/offline/cache';
import { supabase, type BodyDomainType } from '@/lib/supabase';

export type BodyBaselines = Partial<Record<BodyDomainType, number>>;

/**
 * Each evening body domain's rolling baseline over the 90 days before
 * `beforeDate` — the value an untouched slider rests at and is saved as.
 * Days before the one being logged only: including it would fold a value into
 * its own baseline. Rounded, because the slider steps in whole numbers and the
 * columns are smallint.
 *
 * Offline, the last set computed for today stands in. Without it every
 * untouched slider would save the flat midpoint, which is exactly the
 * invented data the baseline exists to avoid.
 */
export async function loadBodyBaselines(userId: string, beforeDate: string): Promise<BodyBaselines> {
  const { data, error } = await supabase
    .from('body_checkins').select('*')
    .eq('user_id', userId)
    .gte('entry_date', addDays(beforeDate, -90))
    .lt('entry_date', beforeDate)
    .order('entry_date', { ascending: true });

  if (error) return (await readCache<BodyBaselines>(userId, 'bodyBaselines')) ?? {};

  const rows = (data ?? []) as Record<string, unknown>[];
  const baselines: BodyBaselines = {};
  for (const d of CHECKIN_BODY_DOMAIN_ORDER) {
    const history = rows.map(r => dailyBodyValue(r, d)).filter((v): v is number => v !== null);
    baselines[d] = Math.round(rollingBodyBaseline(history));
  }
  if (beforeDate === todayDateString()) writeCache(userId, 'bodyBaselines', baselines);
  return baselines;
}
