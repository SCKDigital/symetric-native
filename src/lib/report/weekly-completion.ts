import type { CheckIn } from '@/lib/supabase';

export interface WeeklyCompletion {
  weekStart: string; // ISO YYYY-MM-DD, the Monday of the week
  scheduled: number;
  completed: number;
  pct: number;
}

// Direct port of the week-by-week completion breakdown from the web app's
// lib/report/generateReport.ts (computeWeeklyCompletion), unchanged —
// Monday-anchored ISO week bucketing over the report's own check-ins.
export function computeWeeklyCompletion(checkIns: CheckIn[], dateFrom: string, dateTo: string): WeeklyCompletion[] {
  function getWeekStart(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay(); // 0=Sun, 1=Mon ...
    const daysToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + daysToMon);
    return mon.toISOString().slice(0, 10);
  }

  const byWeek: Record<string, { scheduled: number; completed: number }> = {};
  for (const ci of checkIns) {
    const date = new Date(ci.scheduled_at).toLocaleDateString('en-CA');
    if (date < dateFrom || date > dateTo) continue;
    const ws = getWeekStart(date);
    if (!byWeek[ws]) byWeek[ws] = { scheduled: 0, completed: 0 };
    byWeek[ws].scheduled++;
    if (ci.status === 'completed') byWeek[ws].completed++;
  }

  return Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { scheduled, completed }]) => ({
      weekStart,
      scheduled,
      completed,
      pct: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0,
    }));
}
