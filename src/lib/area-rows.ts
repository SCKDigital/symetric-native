// Ported from the web app's src/lib/areaRows.ts, unchanged — pure
// composition for "The evidence" section of Insights: one row per area
// (mind/body/sleep/medication).

import { Area, PatternFinding } from '@/lib/pattern-findings';

export type AreaRowState = 'active' | 'empty' | 'muted';

export interface AreaRow {
  area: Area;
  label: string;
  subtitle: string;
  state: AreaRowState;
}

function countFindings(findings: PatternFinding[]): number {
  return findings.filter(f => f.grade !== 'limited').length;
}

interface MindInput {
  findings: PatternFinding[];
  trackedDomainCount: number;
}

interface BodyInput {
  tracked: boolean;
  daysLogged: number;
  risingCount: number;
}

interface SleepInput {
  findings: PatternFinding[];
}

interface MedicationInput {
  markerCount: number;
  tooRecentLabel: string | null;
  findings: PatternFinding[];
}

export interface BuildAreaRowsInput {
  mind: MindInput;
  body: BodyInput;
  sleep: SleepInput;
  medication: MedicationInput;
}

/**
 * Builds "The evidence" rows, in fixed display order (Mind, Body, Sleep,
 * Medication). An area the user doesn't track is omitted from the result
 * entirely, rather than rendered in any state.
 */
export function buildAreaRows(input: BuildAreaRowsInput): AreaRow[] {
  const rows: AreaRow[] = [buildMindRow(input.mind)];

  if (input.body.tracked) rows.push(buildBodyRow(input.body));

  rows.push(buildSleepRow(input.sleep));

  if (input.medication.markerCount > 0) rows.push(buildMedicationRow(input.medication));

  return rows;
}

function buildMindRow({ findings, trackedDomainCount }: MindInput): AreaRow {
  const count = countFindings(findings);
  if (count === 0) {
    return { area: 'mind', label: 'Mind', subtitle: trackedDomainCount > 0 ? `${trackedDomainCount} domains steady` : 'No standout patterns yet', state: 'empty' };
  }
  const steady = Math.max(0, trackedDomainCount - count);
  return {
    area: 'mind',
    label: 'Mind',
    subtitle: steady > 0 ? `${count} pattern${count !== 1 ? 's' : ''} · ${steady} domain${steady !== 1 ? 's' : ''} steady` : `${count} pattern${count !== 1 ? 's' : ''} found`,
    state: 'active',
  };
}

function buildBodyRow({ daysLogged, risingCount }: BodyInput): AreaRow {
  if (daysLogged === 0) {
    return { area: 'body', label: 'Body', subtitle: 'No check-ins logged yet', state: 'empty' };
  }
  if (risingCount === 0) {
    return { area: 'body', label: 'Body', subtitle: `${daysLogged} days logged · nothing standing out`, state: 'empty' };
  }
  return { area: 'body', label: 'Body', subtitle: `${risingCount} symptom${risingCount !== 1 ? 's' : ''} rising`, state: 'active' };
}

function buildSleepRow({ findings }: SleepInput): AreaRow {
  const count = countFindings(findings);
  if (count === 0) {
    return { area: 'sleep', label: 'Sleep', subtitle: 'No clear connections yet', state: 'empty' };
  }
  return { area: 'sleep', label: 'Sleep', subtitle: count === 1 ? 'Affects 1 area' : `Affects ${count} areas`, state: 'active' };
}

function buildMedicationRow({ tooRecentLabel, findings }: MedicationInput): AreaRow {
  if (tooRecentLabel) {
    return { area: 'medication', label: 'Medication', subtitle: tooRecentLabel, state: 'muted' };
  }
  const count = countFindings(findings);
  if (count === 0) {
    return { area: 'medication', label: 'Medication', subtitle: 'No standout effects yet', state: 'empty' };
  }
  return { area: 'medication', label: 'Medication', subtitle: `${count} effect${count !== 1 ? 's' : ''} observed`, state: 'active' };
}
