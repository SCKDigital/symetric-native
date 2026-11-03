// Aisha's 90 days, as raw rows: the check-ins, sleep logs, body check-ins,
// events and markers she would actually have entered. Nothing here is a
// finding. Every pattern the report shows is whatever the app's own detectors
// make of these rows, which is the point of building it this way.
//
// The persona and narrative are from docs/demo-profile-aisha.md:
// 29, generalised anxiety (diagnosed, medicated), and ADHD, POTS and
// hypermobile EDS all suspected and waiting on referrals. Read that before
// changing the story. The report must stay descriptive; nothing here should
// be shaped to make it read like evidence for a diagnosis.

export const USER_ID = 'demo-aisha';
export const APPOINTMENT_ID = 'appt-aisha';
export const N_DAYS = 90;

// Story beats, as day indices into the 90 (0 = oldest).
//
// Spaced so each intervention's before/after window is clean. The app reads
// a marker's effect by comparing the 21 days either side of it; physio
// starting straight after the flare compared calm weeks against flare weeks
// and credited physio with the flare ending.
const MED_DAY = 12;          // sertraline dose increase
const LETTER_DAY = 33;       // ADHD assessment referral letter arrives
const FLARE_START = 34;      // the flare that follows it, arriving the next day
const FLARE_END = 51;
const THERAPY_DAY = 72;      // hypermobility physio starts
const PRESYNCOPE_DAY = 22;   // a day energy falls apart within the day
const POOR_SLEEP = [35, 36, 37, 38, 39];
const CYCLE_DAY_ONES = [3, 31, 59, 87];
const LOW_WEEK = [56, 57, 58, 59, 60, 61, 62]; // a week she mostly couldn't log

const MIND = ['mood', 'energy', 'anxiety', 'concentration', 'sensory_sensitivity'] as const;
const BODY = ['fatigue', 'pain_mechanical', 'pain_widespread', 'joint_instability', 'breathlessness', 'orthostatic', 'gut', 'brain_fog', 'exhaustion'] as const;
const MORNING = ['fatigue', 'pain_mechanical', 'orthostatic'] as const;

// Deterministic, so the sample report is the same every time it's built.
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261102);
const noise = (amp: number) => (rand() + rand() + rand() - 1.5) * amp; // roughly normal
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ramp = (i: number, start: number, span: number) => (i < start ? 0 : Math.min(1, (i - start) / span));

// The flare comes on with the letter rather than building up to it, and eases
// over its second week. Its shape matters: the app compares each day with
// the median of the fortnight before, so a slow build would be absorbed into
// that moving baseline and never stand out, which is not how this one felt.
const flareLevel = (i: number) =>
  i < FLARE_START || i > FLARE_END ? 0 : i <= FLARE_START + 7 ? 1 : (FLARE_END + 1 - i) / (FLARE_END - FLARE_START - 7);

// Captured once, at load: the generator moves the clock while it replays
// weekly detection, and the 90 days must not move with it.
const REAL_TODAY = Date.now();

/** Local calendar date for day index i, ending yesterday. */
export function dayDate(i: number): Date {
  const d = new Date(REAL_TODAY);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (N_DAYS - i));
  return d;
}
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const at = (i: number, h: number, m: number) => {
  const d = dayDate(i);
  d.setHours(h, m, 0, 0);
  return d;
};

export const DATE_FROM = ymd(dayDate(0));
export const DATE_TO = ymd(dayDate(N_DAYS - 1));

export function buildAishaRows() {
  // ── Sleep first: next-day mind and body readings lean on it ────────────
  const sleepScore: number[] = [];
  const sleepLogs = [];
  for (let i = 0; i < N_DAYS; i++) {
    const poor = POOR_SLEEP.includes(i) || rand() < 0.2;
    const score = poor ? (rand() < 0.5 ? 1 : 2) : clamp(Math.round(3.7 + noise(1.2)), 2, 5);
    sleepScore.push(score);
    if (rand() < 0.07) continue; // the odd unlogged night
    sleepLogs.push({
      user_id: USER_ID, log_date: ymd(dayDate(i)), score, skipped: false,
      hours_slept: Math.round((poor ? 4.6 + noise(0.8) : 7.1 + noise(0.9)) * 2) / 2,
      created_at: at(i, 8, 5).toISOString(),
    });
  }
  const lastNight = (i: number) => sleepScore[i] ?? 3.5;

  // ── Mind: three check-ins a day inside 08:00-21:00 ─────────────────────
  // Day-to-day swing in anxiety, shared with gut below: the two move
  // together on ordinary days too, not only during the flare.
  const anxietyDay = Array.from({ length: N_DAYS }, () => noise(1.0));
  const anxietyLevel = (i: number) =>
    5.8 - ramp(i, MED_DAY, 8) * 2.2 + flareLevel(i) * 3.8 + anxietyDay[i];

  function mindValues(i: number, block: 'morning' | 'midday' | 'evening') {
    const flare = flareLevel(i);
    const med = ramp(i, MED_DAY, 8);
    const sleepDebt = 3.5 - lastNight(i); // positive after a poor night
    const weekday = dayDate(i).getDay();
    const anxiety = anxietyLevel(i) + (block === 'evening' ? 0.3 : 0);
    let energy = 5.2 - flare * 2.6 - sleepDebt * 0.8
      + { morning: -1.0, midday: 0.2, evening: 0.4 }[block];
    if (i === PRESYNCOPE_DAY) energy = { morning: 6, midday: 1, evening: 2 }[block];
    return {
      anxiety,
      mood: 6.0 + med * 1.2 - flare * 1.2,
      energy,
      concentration: 5.4 - flare * 3.0 - sleepDebt * 0.9 - (anxiety - 5.5) * 0.3,
      // The Wednesday pattern: busiest, loudest day of her week at work.
      sensory_sensitivity: 4.2 - med * 1.0 + flare * 0.9 + (weekday === 3 ? 1.9 : 0),
    };
  }

  const NOTES: Record<number, string> = {
    12: 'Loud office all morning, skipped lunch',
    [LETTER_DAY]: 'Assessment letter came. Good news, apparently. Could not settle all afternoon.',
    39: "Couldn't focus at all, reread the same email four times",
    53: 'Better day. Walked to the shops and back without needing to sit down.',
  };

  const checkIns = [];
  const blocks = [
    { block: 'morning' as const, h: 9, m: 10 },
    { block: 'midday' as const, h: 13, m: 40 },
    { block: 'evening' as const, h: 19, m: 30 },
  ];
  for (let i = 0; i < N_DAYS; i++) {
    const date = ymd(dayDate(i));
    // Late in the flare, worn out, some days she managed nothing but comfort
    // mode's one-tap at midday and missed the other two. A one-tap alongside
    // real answers on the same day would read to the app as a big swing
    // within the day, which is not what those days were.
    const oneTapDay = i >= FLARE_START + 6 && i <= FLARE_START + 11 && rand() < 0.5;
    for (const { block, h, m } of blocks) {
      const scheduled = at(i, h, m + Math.floor(rand() * 40) - 20);
      // Mornings are the ones that get missed: she's at her worst on standing.
      const missRate = oneTapDay ? (block === 'midday' ? 0 : 1)
        : LOW_WEEK.includes(i) ? 0.45 : block === 'morning' ? 0.3 : 0.1;
      const completed = rand() >= missRate;
      const base = {
        user_id: USER_ID, scheduled_at: scheduled.toISOString(), scheduled_date: date,
        expires_at: new Date(scheduled.getTime() + 30 * 60_000).toISOString(),
        created_at: scheduled.toISOString(),
      };
      if (!completed) {
        checkIns.push({ ...base, status: 'expired' });
        continue;
      }
      const v = mindValues(i, block);
      // A one-tap's values are filled in below, once there is history to take
      // a baseline from.
      const oneTap = oneTapDay;
      const values = Object.fromEntries(MIND.map(d => [d, clamp(Math.round(v[d] + noise(0.9)), 1, 10)]));
      checkIns.push({
        ...base, status: 'completed',
        completed_at: new Date(scheduled.getTime() + (2 + Math.floor(rand() * 20)) * 60_000).toISOString(),
        low_demand: oneTap,
        ...values,
        notes: block === 'evening' ? (NOTES[i] ?? null) : null,
      });
    }
  }

  // A one-tap entry records every domain at the person's own baseline
  // (logAsUsual in src/app/index.tsx), so fill those from the median of her
  // real answers over the 30 days before it, which is what the rolling
  // baseline would have held at the time.
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const answered = checkIns.filter(c => c.status === 'completed' && !c.low_demand) as Record<string, unknown>[];
  for (const c of checkIns as Record<string, unknown>[]) {
    if (!c.low_demand) continue;
    const t = new Date(c.scheduled_at as string).getTime();
    const prior = answered.filter(a => {
      const at2 = new Date(a.scheduled_at as string).getTime();
      return at2 < t && at2 >= t - 30 * 86_400_000;
    });
    for (const d of MIND) c[d] = Math.round(median(prior.map(a => a[d] as number)));
  }

  // ── Body: an evening check-in most days, a morning one some days ───────
  const PAIN_WORDS = ['aching', 'stiff', 'throbbing', 'electric or shooting', 'burning'];
  const BREATH_WORDS = ['breathless on effort', "can't get a full breath", 'breathless when upright'];
  const BODY_NOTES: Record<number, string> = {
    8: 'Knee gave way going down stairs',
    [PRESYNCOPE_DAY]: 'Stood up too fast after a shower, went grey and had to sit back down',
    42: 'Pushed through the flare week and paid for it the next two days',
    66: 'Wrist went reaching for a high shelf',
  };

  const daysToCycle = (i: number) => Math.min(...CYCLE_DAY_ONES.map(d => Math.abs(i - d)));

  const bodyCheckIns = [];
  const painSites = [];
  for (let i = 0; i < N_DAYS; i++) {
    if (!BODY_NOTES[i] && (LOW_WEEK.includes(i) ? rand() < 0.5 : rand() < 0.12)) continue;
    const flare = flareLevel(i);
    const therapy = ramp(i, THERAPY_DAY, 10);
    const sleepDebt = 3.5 - lastNight(i);
    const nearCycle = daysToCycle(i) <= 2 ? 1 : 0;
    const anxDay = anxietyLevel(i);
    const evening: Record<string, number> = {
      fatigue: 4.3 + sleepDebt * 0.9 + flare * 1.2 + nearCycle * 1.3,
      pain_mechanical: 4.9 - therapy * 1.7 + (i === 8 || i === 66 ? 2.5 : 0),
      pain_widespread: 3.4 + nearCycle * 1.5,
      joint_instability: 5.3 - therapy * 2.1 + (i === 8 || i === 66 ? 2 : 0),
      breathlessness: 2.1 + (i === PRESYNCOPE_DAY ? 2 : 0),
      orthostatic: 3.6 + (i === PRESYNCOPE_DAY ? 3 : 0),
      gut: 3.2 + (anxDay - 5.0) * 0.8,
      brain_fog: 4.0 + flare * 1.8 + sleepDebt * 0.6,
      exhaustion: 5.0 + flare * 1.4 + sleepDebt * 0.4,
    };
    const row: Record<string, unknown> = {
      id: `body-${i}`, user_id: USER_ID, entry_date: ymd(dayDate(i)),
      entered_retroactively: false, pain_diffuse: false, edit_count: 0,
      logged_at: at(i, 20, 30).toISOString(), created_at: at(i, 20, 30).toISOString(),
      note: BODY_NOTES[i] ?? null,
    };
    for (const d of BODY) row[d] = clamp(Math.round(evening[d] + noise(1.1)), 0, 10);

    // Morning: worse on standing first thing, the pattern with no marker near it.
    if (rand() < 0.72) {
      row.morning_fatigue = clamp(Math.round(evening.fatigue + 0.4 + noise(1)), 0, 10);
      row.morning_pain_mechanical = clamp(Math.round(evening.pain_mechanical + 0.6 + noise(1)), 0, 10);
      row.morning_orthostatic = clamp(Math.round(6.3 + noise(1.2)), 0, 10);
      row.morning_logged_at = at(i, 8, 15).toISOString();
    }

    const pain = Math.max(row.pain_mechanical as number, row.pain_widespread as number);
    row.pain_character = pain > 3 && rand() < 0.6
      ? PAIN_WORDS.filter(() => rand() < 0.35).slice(0, 2).concat(pain > 6 ? ['electric or shooting'] : [])
        .filter((w, k, a) => a.indexOf(w) === k)
      : [];
    if ((row.pain_character as string[]).length === 0 && pain > 4) row.pain_character = ['aching'];
    row.breathlessness_character = (row.breathlessness as number) > 2 && rand() < 0.5
      ? [BREATH_WORDS[Math.floor(rand() * BREATH_WORDS.length)]]
      : [];
    bodyCheckIns.push(row);

    // Where it hurt: classic hypermobile joints, not everywhere.
    if ((row.pain_mechanical as number) >= 5 || (row.joint_instability as number) >= 6) {
      const site = rand();
      const [region, side] = i === 66 || site > 0.85 ? ['wrist', 'R'] : site > 0.55 ? ['shoulder', 'L'] : ['knee', 'R'];
      painSites.push({ body_checkin_id: row.id, user_id: USER_ID, region, side, aspect: 'front' });
    }
  }

  // ── Events as they happened ────────────────────────────────────────────
  const eventSpec: [number, string, [string, string] | null][] = [
    [8, 'subluxation', ['knee', 'R']],
    [16, 'palpitations', null],
    [PRESYNCOPE_DAY, 'presyncope', null],
    [27, 'migraine_onset', null],
    [37, 'palpitations', null],
    [42, 'crash_onset', null],
    [66, 'subluxation', ['wrist', 'R']],
    [81, 'palpitations', null],
  ];
  const bodyEvents = [];
  const bodyEventSites = [];
  for (const [i, type, site] of eventSpec) {
    const id = `event-${i}-${type}`;
    bodyEvents.push({
      id, user_id: USER_ID, event_date: ymd(dayDate(i)), event_type: type,
      entered_retroactively: false, character: null, created_at: at(i, 20, 40).toISOString(),
    });
    if (site) bodyEventSites.push({ body_event_id: id, user_id: USER_ID, region: site[0], side: site[1] });
  }

  // ── Markers ────────────────────────────────────────────────────────────
  const marker = (i: number, marker_type: string, label: string, medication_action?: string) => ({
    user_id: USER_ID, marker_date: ymd(dayDate(i)), marker_type, label,
    ...(medication_action ? { medication_action } : {}),
  });
  const markers = [
    marker(MED_DAY, 'medication', 'Increased sertraline to 150mg', 'increase'),
    marker(LETTER_DAY, 'life_event', 'ADHD assessment referral letter arrived'),
    marker(THERAPY_DAY, 'therapy', 'Started hypermobility physiotherapy'),
    ...CYCLE_DAY_ONES.map(i => marker(i, 'cycle_phase', 'Day 1', 'day_one')),
  ];

  // ── Account and setup ──────────────────────────────────────────────────
  const profile = {
    id: USER_ID, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    display_name: 'Aisha', report_display_name: 'Aisha',
    body_tracking_enabled: true, body_domains_active: [...BODY],
    body_morning_enabled: true, body_morning_domains: [...MORNING],
    cycle_tracking_enabled: true, accent: 'porcelain',
  };
  const settings = {
    user_id: USER_ID, active_domains: [...MIND], check_ins_per_day: 3,
    window_start: '08:00:00', window_end: '21:00:00', time_format: '12hr',
  };
  // What choosing domains on day one seeds (setup-cards.tsx): a neutral 5,
  // superseded by the rolling recalc once there is history.
  const baselines = MIND.map(domain => ({
    user_id: USER_ID, domain, baseline_score: 5, source: 'default', is_current: true,
    set_at: at(0, 8, 0).toISOString(),
  }));

  const appointment = {
    id: APPOINTMENT_ID, user_id: USER_ID, appointment_date: ymd(new Date(Date.now() + 12 * 86_400_000)),
    focus_areas: ['Fatigue', 'Dizziness on standing', 'The Wednesday pattern'], is_completed: false,
  };
  const questions = [
    { user_id: USER_ID, appointment_id: APPOINTMENT_ID, sort_order: 0, is_priority: true, is_addressed: false, is_auto_generated: false,
      question_text: 'Could the anxiety and stomach flare in the weeks after the assessment letter be linked to it?' },
    { user_id: USER_ID, appointment_id: APPOINTMENT_ID, sort_order: 1, is_priority: false, is_addressed: false, is_auto_generated: false,
      question_text: 'Is the morning dizziness worth raising before the cardiology referral comes through?' },
  ];

  return {
    profile, settings, baselines, checkIns, sleepLogs, bodyCheckIns, painSites,
    bodyEvents, bodyEventSites, markers, appointment, questions,
  };
}
