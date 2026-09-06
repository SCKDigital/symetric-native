import { DomainType, supabase } from '@/lib/supabase';

// Port of the web app's src/lib/dataExport.ts. Same queries, same columns,
// same JSON shape — the difference is the delivery mechanic. The web version
// ends in downloadBlob(); a phone has no downloads folder, so these functions
// return { name, content } and the caller writes them to the cache directory
// and hands them to the share sheet, the same way the PDF report already does
// in prepare/generate-report-section.tsx.

const ALL_DOMAIN_COLUMNS: DomainType[] = [
  'mood', 'energy', 'anxiety', 'concentration', 'irritability',
  'social_battery', 'sensory_sensitivity', 'motivation',
];

export interface ExportFile {
  name: string;
  content: string;
  mimeType: string;
}

/** Always quoted, so commas, newlines and quotes inside a note are safe. */
function e(val: unknown): string {
  if (val === null || val === undefined) return '';
  return `"${String(val).replace(/"/g, '""')}"`;
}

function arrayToCSV(headers: string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

type Row = Record<string, unknown>;

function generateCheckInsCSV(checkIns: Row[]): string {
  const headers = [
    'scheduled_date', 'scheduled_at', 'completed_at', 'status',
    ...ALL_DOMAIN_COLUMNS,
    'notes', 'edited_at', 'edit_count',
  ];
  const rows = checkIns.map(ci => [
    e(ci.scheduled_at ? new Date(ci.scheduled_at as string).toLocaleDateString('en-CA') : ''),
    e(ci.scheduled_at ?? ''),
    e(ci.completed_at ?? ''),
    e(ci.status ?? ''),
    // An expired check-in has no reported values; exporting whatever sits in
    // those columns would present never-answered questions as answers.
    ...ALL_DOMAIN_COLUMNS.map(d => e(ci.status === 'expired' ? '' : (ci[d] ?? ''))),
    e(ci.notes ?? ''),
    e(ci.edited_at ?? ''),
    e(ci.edit_count ?? ''),
  ]);
  return arrayToCSV(headers, rows);
}

function generateSleepLogsCSV(sleepLogs: Row[]): string {
  const headers = ['log_date', 'sleep_score', 'hours_slept', 'skipped', 'edited_at', 'edit_count'];
  const rows = sleepLogs.map(sl => [
    e(sl.log_date ?? ''), e(sl.score ?? ''), e(sl.hours_slept ?? ''),
    e(sl.skipped ? 'true' : 'false'), e(sl.edited_at ?? ''), e(sl.edit_count ?? ''),
  ]);
  return arrayToCSV(headers, rows);
}

function generateClustersCSV(clusters: Row[], tagsByCluster: Map<string, string[]>): string {
  const headers = [
    'cluster_type', 'domains', 'start_date', 'end_date', 'ongoing',
    'severity_score', 'flagged_for_report', 'data_quality',
    'avg_sleep_during_pattern', 'user_notes', 'context_tags',
  ];
  const rows = clusters.map(c => [
    e(c.cluster_type ?? ''),
    e(Array.isArray(c.domains_involved) ? (c.domains_involved as string[]).join(', ') : ''),
    e(c.start_date ?? ''),
    e(c.end_date ?? ''),
    e(c.ongoing ? 'true' : 'false'),
    e(c.severity_score ?? ''),
    e(c.flagged_for_report ? 'true' : 'false'),
    e(c.data_quality ?? ''),
    e(c.avg_sleep_during_pattern ?? ''),
    e(c.user_notes ?? ''),
    e((tagsByCluster.get(c.id as string) ?? []).join(', ')),
  ]);
  return arrayToCSV(headers, rows);
}

function generateMarkersCSV(markers: Row[]): string {
  const headers = ['marker_date', 'marker_type', 'medication_action', 'label'];
  const rows = markers.map(m => [
    e(m.marker_date ?? ''), e(m.marker_type ?? ''), e(m.medication_action ?? ''), e(m.label ?? ''),
  ]);
  return arrayToCSV(headers, rows);
}

/** Four files, matching the four the web version downloads. */
export async function buildCsvExport(userId: string): Promise<ExportFile[]> {
  const exportDate = new Date().toLocaleDateString('en-CA');

  const [checkIns, sleepLogs, clusters, markers, contextTags] = await Promise.all([
    supabase.from('check_ins').select('*').eq('user_id', userId).order('scheduled_at', { ascending: true }),
    supabase.from('sleep_logs').select('*').eq('user_id', userId).order('log_date', { ascending: true }),
    supabase.from('detected_clusters').select('*').eq('user_id', userId).order('start_date', { ascending: true }),
    supabase.from('intervention_markers').select('*').eq('user_id', userId).order('marker_date', { ascending: true }),
    supabase.from('context_tags').select('*').eq('user_id', userId),
  ]);

  const tagsByCluster = new Map<string, string[]>();
  ((contextTags.data as Row[] | null) ?? []).forEach(ct => {
    const key = ct.cluster_id as string;
    if (!tagsByCluster.has(key)) tagsByCluster.set(key, []);
    tagsByCluster.get(key)!.push(ct.tag as string);
  });

  const csv = 'text/csv';
  return [
    { name: `symetric_check_ins_${exportDate}.csv`, mimeType: csv, content: generateCheckInsCSV((checkIns.data as Row[]) ?? []) },
    { name: `symetric_sleep_logs_${exportDate}.csv`, mimeType: csv, content: generateSleepLogsCSV((sleepLogs.data as Row[]) ?? []) },
    { name: `symetric_patterns_${exportDate}.csv`, mimeType: csv, content: generateClustersCSV((clusters.data as Row[]) ?? [], tagsByCluster) },
    { name: `symetric_markers_${exportDate}.csv`, mimeType: csv, content: generateMarkersCSV((markers.data as Row[]) ?? []) },
  ];
}

export async function buildJsonExport(userId: string): Promise<ExportFile> {
  const [checkIns, sleepLogs, baselines, clusters] = await Promise.all([
    supabase.from('check_ins').select('*').eq('user_id', userId).order('scheduled_at', { ascending: true }),
    supabase.from('sleep_logs').select('*').eq('user_id', userId).order('log_date', { ascending: true }),
    supabase.from('baselines').select('*').eq('user_id', userId).eq('is_current', true),
    supabase.from('detected_clusters').select('*').eq('user_id', userId).order('start_date', { ascending: true }),
  ]);

  const baselineMap: Record<string, number> = {};
  ((baselines.data as Row[] | null) ?? []).forEach(b => { baselineMap[b.domain as string] = b.baseline_score as number; });

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
  const formatTimeOfDay = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const rows = (checkIns.data as Row[] | null) ?? [];
  const to = new Date().toLocaleDateString('en-CA');
  const from = rows.length ? formatDate(rows[0].scheduled_at as string) : to;

  const output = {
    exported_at: new Date().toISOString(),
    date_range: { from, to },
    baselines: baselineMap,
    check_ins: rows.map(ci => {
      const domains: Record<string, number> = {};
      ALL_DOMAIN_COLUMNS.forEach(d => {
        const val = ci[d];
        if (val !== null && val !== undefined) domains[d] = val as number;
      });
      return {
        date: formatDate(ci.scheduled_at as string),
        time: formatTimeOfDay(ci.scheduled_at as string),
        status: ci.status,
        domains,
        notes: ci.notes ?? null,
      };
    }),
    sleep_logs: ((sleepLogs.data as Row[] | null) ?? []).map(sl => ({
      date: sl.log_date, sleep_score: sl.score, hours_slept: sl.hours_slept, skipped: sl.skipped,
    })),
    patterns: ((clusters.data as Row[] | null) ?? []).map(c => ({
      cluster_type: c.cluster_type ?? null,
      domains: c.domains_involved ?? [],
      start_date: c.start_date,
      end_date: c.end_date ?? null,
      ongoing: c.ongoing,
      severity_score: c.severity_score ?? null,
      flagged_for_report: c.flagged_for_report ?? false,
      data_quality: c.data_quality ?? null,
      user_notes: c.user_notes ?? null,
    })),
  };

  return {
    name: `symetric_export_${to}.json`,
    mimeType: 'application/json',
    content: JSON.stringify(output, null, 2),
  };
}
