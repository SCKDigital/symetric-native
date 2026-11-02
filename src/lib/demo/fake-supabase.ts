// An in-memory stand-in for the Supabase client, used only by the website demo
// (EXPO_PUBLIC_DEMO=1). Nothing here talks to the network: every table is an
// array in memory, seeded by ./seed.ts, and a reload puts it back the way it
// started.
//
// It implements the slice of PostgREST's query builder this app actually
// calls, not the whole thing. If a new screen reaches for a filter this does
// not know, the call rejects with a message naming it, rather than quietly
// returning every row: a demo that shows the wrong data is worse than one that
// visibly breaks while it is being built.

import { DEMO_USER, seedTables } from './seed';

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null; status: number };

let tables: Tables | null = null;
function db(): Tables {
  // Seeded lazily, so the dates in the seed are relative to when the visitor
  // opened the page rather than to when the bundle was built.
  if (!tables) resetDemoData();
  return tables!;
}

/** Puts every table back to its seeded state. */
export function resetDemoData() {
  tables = seedTables();
  forgetPerUserState();
}

// Per-user state the app keeps in AsyncStorage — which on web is localStorage,
// and survives a reload when the tables do not. The one that matters most is
// pattern-detection-scheduler.ts's "last ran" stamps: without clearing them, a
// visitor returning the same day gets fresh data that detection then declines
// to look at, and an empty Insights. The rest (bonus check-in cooldown,
// Prepare's date range) should start over with the data for the same reason.
// Every such key embeds the user id.
function forgetPerUserState() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return; // static render
    for (const key of Object.keys(storage)) {
      if (key.includes(DEMO_USER.id)) storage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was persisted to forget.
  }
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Child tables an embedded select (`*, body_pain_sites(*)`) can pull in, and
// the column on the child that points back at the parent's id.
const EMBEDS: Record<string, string> = {
  body_pain_sites: 'body_checkin_id',
  body_event_sites: 'body_event_id',
  context_tags: 'cluster_id',
};

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

// Timestamps written by the app ('…Z') and by the seed can differ in format
// for the same instant, so compare those as instants. Bare dates and other
// strings compare lexically, which is what Postgres does for them.
function compare(a: any, b: any): number {
  if (typeof a === 'string' && typeof b === 'string' && ISO_TIMESTAMP.test(a) && ISO_TIMESTAMP.test(b)) {
    return Date.parse(a) - Date.parse(b);
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function coerce(value: string): any {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

type Predicate = (row: Row) => boolean;

function opPredicate(column: string, op: string, value: any): Predicate {
  switch (op) {
    case 'eq': return r => r[column] === value || (r[column] != null && value != null && compare(r[column], value) === 0);
    case 'neq': return r => r[column] !== value;
    case 'gt': return r => r[column] != null && compare(r[column], value) > 0;
    case 'gte': return r => r[column] != null && compare(r[column], value) >= 0;
    case 'lt': return r => r[column] != null && compare(r[column], value) < 0;
    case 'lte': return r => r[column] != null && compare(r[column], value) <= 0;
    case 'is': return r => (value === null ? r[column] == null : r[column] === value);
    case 'in': {
      const list: any[] = Array.isArray(value)
        ? value
        : String(value).replace(/^\(|\)$/g, '').split(',').map(s => coerce(s.trim()));
      return r => list.includes(r[column]);
    }
    default:
      throw new Error(`Demo database does not support the "${op}" filter`);
  }
}

/** Splits on top-level commas, so `a, b(c, d)` gives ['a', 'b(c, d)']. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function project(row: Row, columns: string): Row {
  const parts = splitTopLevel(columns || '*');
  let out: Row = {};
  for (const part of parts) {
    const embed = part.match(/^([a-z_]+)\((.*)\)$/s);
    if (embed) {
      const [, child, childCols] = embed;
      const fk = EMBEDS[child];
      if (!fk) throw new Error(`Demo database does not know how to embed "${child}"`);
      out[child] = (db()[child] ?? []).filter(c => c[fk] === row.id).map(c => project(c, childCols));
    } else if (part === '*') {
      out = { ...row, ...out };
    } else {
      out[part] = row[part] ?? null;
    }
  }
  return out;
}

type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

class QueryBuilder implements PromiseLike<Result> {
  private op: Operation = 'select';
  private columns = '*';
  private returning = false;
  private payload: Row[] = [];
  private onConflict = 'id';
  private predicates: Predicate[] = [];
  private orders: { column: string; ascending: boolean; nullsFirst?: boolean }[] = [];
  private rowLimit: number | null = null;
  private cardinality: 'many' | 'single' | 'maybeSingle' = 'many';
  private countOnly = false;
  private wantCount = false;
  private problem: string | null = null;

  constructor(private table: string) {}

  select(columns = '*', options?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.columns = columns;
    } else {
      // .insert(...).select('id') — return the written rows.
      this.returning = true;
      this.columns = columns;
    }
    if (options?.count) this.wantCount = true;
    if (options?.head) this.countOnly = true;
    return this;
  }

  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    if (options?.onConflict) this.onConflict = options.onConflict;
    return this;
  }

  update(values: Row) {
    this.op = 'update';
    this.payload = [values];
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  private where(p: Predicate) {
    this.predicates.push(p);
    return this;
  }

  private guard(fn: () => Predicate) {
    try {
      return this.where(fn());
    } catch (e) {
      this.problem = (e as Error).message;
      return this;
    }
  }

  eq(column: string, value: any) { return this.guard(() => opPredicate(column, 'eq', value)); }
  neq(column: string, value: any) { return this.guard(() => opPredicate(column, 'neq', value)); }
  gt(column: string, value: any) { return this.guard(() => opPredicate(column, 'gt', value)); }
  gte(column: string, value: any) { return this.guard(() => opPredicate(column, 'gte', value)); }
  lt(column: string, value: any) { return this.guard(() => opPredicate(column, 'lt', value)); }
  lte(column: string, value: any) { return this.guard(() => opPredicate(column, 'lte', value)); }
  is(column: string, value: any) { return this.guard(() => opPredicate(column, 'is', value)); }
  in(column: string, values: any[]) { return this.guard(() => opPredicate(column, 'in', values)); }

  not(column: string, op: string, value: any) {
    return this.guard(() => {
      const inner = opPredicate(column, op, value);
      return r => !inner(r);
    });
  }

  /** PostgREST's `or` string: `end_date.gte.2026-01-01,end_date.is.null`. */
  or(filters: string) {
    return this.guard(() => {
      const preds = splitTopLevel(filters).map(f => {
        const [column, op, ...rest] = f.split('.');
        return opPredicate(column, op, coerce(rest.join('.')));
      });
      return r => preds.some(p => p(r));
    });
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true, nullsFirst: options?.nullsFirst });
    return this;
  }

  limit(n: number) {
    this.rowLimit = n;
    return this;
  }

  single() {
    this.cardinality = 'single';
    return this;
  }

  maybeSingle() {
    this.cardinality = 'maybeSingle';
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    // A microtask, so callers see the same async ordering the real client gives.
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.predicates.every(p => p(row));
  }

  private run(): Result {
    if (this.problem) {
      console.error(`[demo] ${this.table}: ${this.problem}`);
      return { data: null, error: { message: this.problem }, status: 400 };
    }
    const all = (db()[this.table] ??= []);
    const now = new Date().toISOString();
    let rows: Row[];

    switch (this.op) {
      case 'select':
        rows = all.filter(r => this.matches(r));
        break;
      case 'insert':
        rows = this.payload.map(v => ({ id: uuid(), created_at: now, updated_at: now, ...v }));
        all.push(...rows);
        break;
      case 'upsert': {
        const keys = this.onConflict.split(',').map(k => k.trim());
        rows = this.payload.map(v => {
          const existing = all.find(r => keys.every(k => r[k] === v[k]));
          if (existing) {
            Object.assign(existing, v, { updated_at: now });
            return existing;
          }
          const created = { id: uuid(), created_at: now, updated_at: now, ...v };
          all.push(created);
          return created;
        });
        break;
      }
      case 'update':
        rows = all.filter(r => this.matches(r));
        rows.forEach(r => Object.assign(r, this.payload[0]));
        break;
      case 'delete':
        rows = all.filter(r => this.matches(r));
        db()[this.table] = all.filter(r => !rows.includes(r));
        break;
    }

    const count = rows.length;
    if (this.countOnly) return { data: null, error: null, count, status: 200 };

    // Writes without .select() return no rows, as PostgREST does.
    if (this.op !== 'select' && !this.returning) {
      return { data: null, error: null, count: this.wantCount ? count : null, status: 201 };
    }

    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.column];
        const bv = b[o.column];
        if (av == null || bv == null) {
          if (av == null && bv == null) return 0;
          // Postgres puts nulls last ascending, first descending, by default.
          const nullsFirst = o.nullsFirst ?? !o.ascending;
          return (av == null ? -1 : 1) * (nullsFirst ? 1 : -1);
        }
        return o.ascending ? compare(av, bv) : compare(bv, av);
      });
    }
    if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);

    // Copies, so a screen mutating what it was handed cannot edit the table.
    const data = rows.map(r => project(r, this.columns));

    if (this.cardinality === 'single') {
      if (data.length !== 1) {
        return {
          data: null,
          error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
          status: 406,
        };
      }
      return { data: data[0], error: null, status: 200 };
    }
    if (this.cardinality === 'maybeSingle') {
      if (data.length > 1) {
        return { data: null, error: { message: 'multiple rows returned', code: 'PGRST116' }, status: 406 };
      }
      return { data: data[0] ?? null, error: null, status: 200 };
    }
    return { data, error: null, count: this.wantCount ? count : null, status: 200 };
  }
}

const session = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 60 * 60 * 24,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  user: DEMO_USER,
};

const ok = <T,>(data: T) => Promise.resolve({ data, error: null });

// Pattern detection, run once over the seeded data before the visitor is
// signed in, so the pulse loader covers it and every screen opens on its
// results. The app runs detection on launch and leaves screens to read
// whatever is there — fine on a phone, where it has normally run earlier
// that day, but a demo starts from fresh data on every visit, and Insights
// opened first would race the detectors and show an empty Sleep section.
// Imported lazily: the scheduler imports this client through supabase.ts.
let preparing: Promise<void> | null = null;
function prepared() {
  preparing ??= import('@/lib/pattern-detection-scheduler')
    .then(m => m.runPatternDetectionIfNeeded(DEMO_USER.id))
    .then(() => undefined)
    .catch(e => console.error('[demo] pattern detection:', e));
  return preparing;
}

export function createDemoClient() {
  return {
    from: (table: string) => new QueryBuilder(table),
    auth: {
      getSession: () => prepared().then(() => ({ data: { session }, error: null })),
      getUser: () => ok({ user: DEMO_USER }),
      setSession: () => ok({ session, user: DEMO_USER }),
      // The demo is always signed in. Neither of these can leave it.
      signInWithOtp: () => ok({}),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: (callback: (event: string, s: typeof session) => void) => {
        prepared().then(() => callback('INITIAL_SESSION', session));
        return { data: { subscription: { unsubscribe() {} } } };
      },
      startAutoRefresh: () => Promise.resolve(),
      stopAutoRefresh: () => Promise.resolve(),
    },
    functions: {
      // Push and consent-recording have nothing to talk to here.
      invoke: () => ok(null),
    },
  };
}
