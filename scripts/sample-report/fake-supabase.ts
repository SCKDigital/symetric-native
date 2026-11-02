// An in-memory stand-in for the Supabase client, just complete enough to run
// the app's own detection pass and report generator against synthetic rows.
//
// It deliberately throws on any query-builder method it does not implement,
// rather than returning nothing: a silently empty result would produce a
// report that looks plausible and is quietly missing a section.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const tables = new Map<string, Row[]>();
let idCounter = 0;

export function seed(table: string, rows: Row[]) {
  const existing = tables.get(table) ?? [];
  tables.set(table, [...existing, ...rows.map(withDefaults)]);
}

/** Replace a table's contents outright. Used to show the detectors only the
 *  rows that existed on the simulated day they run. */
export function replace(table: string, next: Row[]) {
  tables.set(table, next.map(withDefaults));
}

export function rows(table: string): Row[] {
  return tables.get(table) ?? [];
}

/** Every table, for handing the finished state to the website demo. */
export function allTables(): Record<string, Row[]> {
  return Object.fromEntries(tables);
}

function withDefaults(row: Row): Row {
  const now = new Date().toISOString();
  return {
    id: row.id ?? `fake-${++idCounter}`,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
    ...row,
  };
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function coerce(raw: string): unknown {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

// PostgREST's `col.op.value` syntax, for .or() and .not().
function parseCondition(expr: string): Filter {
  const [col, op, ...rest] = expr.split('.');
  const value = coerce(rest.join('.'));
  switch (op) {
    case 'eq': return r => cmp(r[col], value) === 0;
    case 'neq': return r => cmp(r[col], value) !== 0;
    case 'gt': return r => r[col] != null && cmp(r[col], value) > 0;
    case 'gte': return r => r[col] != null && cmp(r[col], value) >= 0;
    case 'lt': return r => r[col] != null && cmp(r[col], value) < 0;
    case 'lte': return r => r[col] != null && cmp(r[col], value) <= 0;
    case 'is': return r => (value === null ? r[col] == null : r[col] === value);
    case 'in': {
      const list = String(value).replace(/^\(|\)$/g, '').split(',').map(s => coerce(s.trim()));
      return r => list.some(v => cmp(r[col], v) === 0);
    }
    default: throw new Error(`fake-supabase: unsupported condition operator "${op}" in "${expr}"`);
  }
}

// `*, body_event_sites(*)` and `*, context_tags(tag)`: attach child rows whose
// foreign key points at this row. The key is guessed from the parent table's
// singular name, which holds for every embed the report path uses.
function embedsOf(columns: string): string[] {
  return [...columns.matchAll(/(\w+)\([^)]*\)/g)].map(m => m[1]);
}
const FOREIGN_KEYS: Record<string, string> = {
  body_event_sites: 'body_event_id',
  context_tags: 'cluster_id',
};

class Query implements PromiseLike<{ data: unknown; error: null; count?: number | null }> {
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private filters: Filter[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private columns = '*';
  private countMode = false;
  private headMode = false;
  private payload: Row[] = [];
  private patch: Row = {};
  private conflictKeys: string[] = ['id'];
  private returning = false;

  constructor(private table: string) {}

  select(columns = '*', opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.columns = columns;
      this.countMode = !!opts?.count;
      this.headMode = !!opts?.head;
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(values: Row | Row[]) { this.op = 'insert'; this.payload = ([] as Row[]).concat(values); return this; }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = ([] as Row[]).concat(values);
    if (opts?.onConflict) this.conflictKeys = opts.onConflict.split(',').map(s => s.trim());
    return this;
  }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(col: string, v: unknown) { this.filters.push(r => cmp(r[col], v) === 0); return this; }
  neq(col: string, v: unknown) { this.filters.push(r => cmp(r[col], v) !== 0); return this; }
  gt(col: string, v: unknown) { this.filters.push(r => r[col] != null && cmp(r[col], v) > 0); return this; }
  gte(col: string, v: unknown) { this.filters.push(r => r[col] != null && cmp(r[col], v) >= 0); return this; }
  lt(col: string, v: unknown) { this.filters.push(r => r[col] != null && cmp(r[col], v) < 0); return this; }
  lte(col: string, v: unknown) { this.filters.push(r => r[col] != null && cmp(r[col], v) <= 0); return this; }
  in(col: string, vs: unknown[]) { this.filters.push(r => vs.some(v => cmp(r[col], v) === 0)); return this; }
  is(col: string, v: unknown) { this.filters.push(r => (v === null ? r[col] == null : r[col] === v)); return this; }
  not(col: string, op: string, v: unknown) {
    const f = parseCondition(`${col}.${op}.${v === null ? 'null' : String(v)}`);
    this.filters.push(r => !f(r));
    return this;
  }
  or(expr: string) {
    const parts = expr.split(',').map(parseCondition);
    this.filters.push(r => parts.some(p => p(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, ascending: opts?.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }

  private matching(): Row[] {
    return (tables.get(this.table) ?? []).filter(r => this.filters.every(f => f(r)));
  }

  private execute() {
    const all = tables.get(this.table) ?? [];
    let out: Row[];

    if (this.op === 'insert') {
      out = this.payload.map(withDefaults);
      tables.set(this.table, [...all, ...out]);
    } else if (this.op === 'upsert') {
      out = [];
      const next = [...all];
      for (const incoming of this.payload) {
        const i = next.findIndex(r => this.conflictKeys.every(k => cmp(r[k], incoming[k]) === 0));
        if (i >= 0) {
          next[i] = { ...next[i], ...incoming, updated_at: new Date().toISOString() };
          out.push(next[i]);
        } else {
          const row = withDefaults(incoming);
          next.push(row);
          out.push(row);
        }
      }
      tables.set(this.table, next);
    } else if (this.op === 'update') {
      const hit = new Set(this.matching());
      out = [];
      tables.set(this.table, all.map(r => {
        if (!hit.has(r)) return r;
        const updated = { ...r, ...this.patch };
        out.push(updated);
        return updated;
      }));
    } else if (this.op === 'delete') {
      const hit = new Set(this.matching());
      out = all.filter(r => hit.has(r));
      tables.set(this.table, all.filter(r => !hit.has(r)));
    } else {
      out = this.matching();
      for (const embed of embedsOf(this.columns)) {
        const fk = FOREIGN_KEYS[embed];
        if (!fk) throw new Error(`fake-supabase: no foreign key known for embed "${embed}"`);
        const children = tables.get(embed) ?? [];
        out = out.map(r => ({ ...r, [embed]: children.filter(c => c[fk] === r.id) }));
      }
    }

    if (this.op !== 'select' && !this.returning) {
      return { data: null, error: null };
    }

    for (const { col, ascending } of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (ascending ? 1 : -1) * cmp(a[col], b[col]));
    }
    const count = out.length;
    if (this.rangeFrom !== null) out = out.slice(this.rangeFrom, (this.rangeTo ?? out.length - 1) + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);

    if (this.headMode) return { data: null, error: null, count };
    if (this.singleMode) {
      if (this.singleMode === 'single' && out.length !== 1) {
        return { data: null, error: { message: `expected one row from ${this.table}, got ${out.length}` } as never, count };
      }
      return { data: out[0] ?? null, error: null, count };
    }
    return { data: out, error: null, count: this.countMode ? count : null };
  }

  then<A, B>(onFulfilled?: ((v: any) => A | PromiseLike<A>) | null, onRejected?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.execute()).then(onFulfilled, onRejected);
  }
}

function strict<T extends object>(target: T, name: string): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in t || typeof prop === 'symbol') return Reflect.get(t, prop, receiver);
      throw new Error(`fake-supabase: ${name}.${String(prop)} is not implemented`);
    },
  });
}

export const supabase = strict({
  from(table: string) {
    return strict(new Query(table), `from('${table}')`);
  },
  auth: strict({
    async getUser() { return { data: { user: { id: 'demo-aisha' } }, error: null }; },
    async getSession() { return { data: { session: null }, error: null }; },
  }, 'auth'),
}, 'supabase');
