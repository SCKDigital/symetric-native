// Builds the website's sample report from Aisha's raw rows, by running the
// app's own pipeline end to end: the weekly baseline recalc, the full
// detection pass (clusters, circadian, connections), then generateReport.
// Only the database and the print call are stand-ins. See README.md.
import * as fs from 'fs';

import { allTables, replace, rows, seed } from './fake-supabase';
import { APPOINTMENT_ID, DATE_FROM, DATE_TO, N_DAYS, USER_ID, buildAishaRows, dayDate } from './aisha-data';
import { recalculateRollingBaseline } from '@/lib/baseline/rolling-baseline-recalc';
import { forcePatternDetection } from '@/lib/pattern-detection-scheduler';
import { fetchClustersForDateRange } from '@/lib/cluster-detection';
import { generateReport } from '@/lib/report/generate-report';

// The detectors read "now" from the clock: the connection and sleep passes
// look at the 30 days before it, cluster detection at the 90. Replaying them
// weekly needs the clock moved, so Date is swapped for one that reports the
// simulated moment whenever it is asked for the current time.
const RealDate = Date;
let simulatedNow: number | null = null;
class SimulatedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0 && simulatedNow !== null) super(simulatedNow);
    else super(...(args as []));
  }
  static now() {
    return simulatedNow ?? RealDate.now();
  }
}
function setClock(at: Date | null) {
  simulatedNow = at ? at.getTime() : null;
  globalThis.Date = (at ? SimulatedDate : RealDate) as DateConstructor;
}

async function main() {
  const out = process.argv[2];
  const demoOut = process.argv[3];
  if (!out) throw new Error('usage: node generate-aisha.js <out.html> [demo-tables.json]');

  const d = buildAishaRows();
  seed('profiles', [d.profile]);
  seed('check_in_settings', [d.settings]);
  seed('baselines', d.baselines);
  seed('appointments', [d.appointment]);
  seed('prepare_questions', d.questions);

  // What she had entered by a given moment. Detector output (clusters,
  // connections, circadian patterns, baselines) is never reset between runs,
  // because in the app it accumulates in the database the same way.
  const showUpTo = (moment: Date) => {
    const iso = moment.toISOString();
    const day = moment.toLocaleDateString('en-CA');
    const bodyIds = new Set(d.bodyCheckIns.filter(b => (b.entry_date as string) <= day).map(b => b.id));
    const eventIds = new Set(d.bodyEvents.filter(e => e.event_date <= day).map(e => e.id));
    replace('check_ins', d.checkIns.filter(c => c.scheduled_at <= iso));
    replace('sleep_logs', d.sleepLogs.filter(s => s.log_date <= day));
    replace('body_checkins', d.bodyCheckIns.filter(b => bodyIds.has(b.id)));
    replace('body_pain_sites', d.painSites.filter(p => bodyIds.has(p.body_checkin_id)));
    replace('body_events', d.bodyEvents.filter(e => eventIds.has(e.id)));
    replace('body_event_sites', d.bodyEventSites.filter(s => eventIds.has(s.body_event_id)));
    replace('intervention_markers', d.markers.filter(m => m.marker_date <= day));
  };

  // Weekly, the way an active user's app runs them: from three weeks in,
  // each evening a week apart, finishing on the last day of the range.
  const runDays: number[] = [];
  for (let i = 20; i < N_DAYS - 1; i += 7) runDays.push(i);
  runDays.push(N_DAYS - 1);

  let recalc: unknown = null;
  for (const i of runDays) {
    const evening = dayDate(i);
    evening.setHours(21, 30, 0, 0);
    setClock(evening);
    showUpTo(evening);
    recalc = await recalculateRollingBaseline(USER_ID);
    await forcePatternDetection(USER_ID);
    console.error(`  ran detection as of ${evening.toLocaleDateString('en-CA')}: ${rows('check_ins').length} check-ins visible, ${rows('detected_clusters').length} clusters stored, recalc ${JSON.stringify(recalc)}`);
  }
  setClock(null);
  showUpTo(new Date());

  const clusters = await fetchClustersForDateRange(USER_ID, DATE_FROM, DATE_TO);

  // Aisha marks the flare after the letter for discussion in Prepare, with a
  // note, exactly as the persona spec has it. Picked from what detection
  // actually found, not invented: the longest sustained deviation that began
  // within a week of the letter. Clusters are one domain each in this app, so
  // the flare shows up as several; she flags the longest.
  const letterDate = d.markers.find(m => m.marker_type === 'life_event')!.marker_date;
  const weekAfter = new Date(new Date(letterDate + 'T12:00:00').getTime() + 7 * 86_400_000).toLocaleDateString('en-CA');
  const span = (c: { start_date: string; end_date?: string }) =>
    new Date(c.end_date ?? DATE_TO).getTime() - new Date(c.start_date).getTime();
  const flare = clusters
    .filter(c => c.cluster_type === 'sustained_deviation' && c.start_date >= letterDate && c.start_date <= weekAfter)
    .sort((a, b) => span(b) - span(a))[0];
  if (flare) {
    seed('prepare_pattern_reviews', [{
      user_id: USER_ID, appointment_id: APPOINTMENT_ID, pattern_id: flare.id,
      pattern_source: 'cluster', should_discuss: true, was_discussed: false,
      user_note: "Started the week the ADHD assessment letter came, couldn't focus at all and the stomach thing came back.",
    }]);
  }

  // expo-print is stubbed to hand the document back rather than print it.
  await generateReport({
    userId: USER_ID, userName: 'Aisha', dateFrom: DATE_FROM, dateTo: DATE_TO,
    clusters, appointmentId: APPOINTMENT_ID, bodyTrackingEnabled: true,
    includeMind: true, includeBody: true, includeCycle: true,
  });
  const html = (globalThis as { __reportHtml?: string }).__reportHtml;
  if (!html) throw new Error('generateReport finished without printing anything');
  fs.writeFileSync(out, html);

  // The website demo opens on this same state — her rows and everything
  // detection stored from them — so the app a visitor clicks through shows
  // the findings this report prints. Timestamps go out as local wall-clock
  // time with no zone, and the demo reads them back in the visitor's zone
  // after moving them to end yesterday: a 9:10am check-in stays at 9:10am
  // for whoever opens it. See src/lib/demo/seed.ts.
  if (demoOut) {
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const wallClock = (iso: string) => {
      const t = new Date(iso);
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    };
    const localise = (v: unknown): unknown =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(v) ? wallClock(v)
        : Array.isArray(v) ? v.map(localise)
          : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, localise(x)]))
            : v;
    const builtFor = new Date().toLocaleDateString('en-CA');
    fs.writeFileSync(demoOut, JSON.stringify({ builtFor, tables: localise(allTables()) }) + '\n');
  }

  // What the pipeline found, so a change to the data or the detectors that
  // empties a section is visible here rather than only in the PDF.
  const summary = {
    range: `${DATE_FROM} to ${DATE_TO}`,
    checkIns: `${d.checkIns.filter(c => c.status === 'completed').length} of ${d.checkIns.length} completed`,
    baselineRecalc: recalc,
    baselines: rows('baselines').filter(b => b.is_current).map(b => `${b.domain} ${b.baseline_score}`),
    clusters: clusters.map(c => `${c.cluster_type} ${c.direction ?? ''} [${(c.domains_involved ?? []).join(', ')}] ${c.start_date}..${c.end_date ?? 'ongoing'} (${c.data_quality ?? '-'})`),
    flaggedForDiscussion: flare ? flare.id : 'NONE FOUND',
    circadian: rows('circadian_patterns').map(c => `${c.domain} high ${c.highest_block}, low ${c.lowest_block}, range ${c.range}`),
    domainConnections: rows('domain_connections').map(c => `${c.domain_a}~${c.domain_b} ${c.moves_together ? 'together' : 'inverse'} r=${c.strength}`),
    sleepConnections: rows('sleep_symptom_connections').filter(c => c.affected_by_sleep).map(c => `${c.domain} diff ${c.difference}`),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
