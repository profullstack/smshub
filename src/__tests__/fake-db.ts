/**
 * A small in-memory stand-in for the supabase-js query builder: enough of
 * select/insert/update/delete with eq/in/gt/lt/order/limit/single/maybeSingle
 * and head counts to run service code against real rows instead of mocks.
 */

import { randomUUID } from "crypto";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export class FakeDb {
  tables: Record<string, Row[]> = {};

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private headCount = false;
  private wantCount = false;
  private limitN: number | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.op = "select";
    else this.returning = true;
    if (opts?.head) this.headCount = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.payload = v;
    return this;
  }
  update(v: Row) {
    this.op = "update";
    this.payload = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  gt(c: string, v: unknown) {
    this.filters.push((r) => r[c] != null && (typeof v === "number" ? Number(r[c]) > v : String(r[c]) > String(v)));
    return this;
  }
  lt(c: string, v: unknown) {
    this.filters.push((r) => r[c] != null && (typeof v === "number" ? Number(r[c]) < v : String(r[c]) < String(v)));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orderBy = { col, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private run(): { data: unknown; error: unknown; count?: number | null } {
    const all = this.db.rows(this.table);
    const match = () => all.filter((r) => this.filters.every((f) => f(r)));
    let out: Row[];
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        ...defaults(this.table),
        ...p,
      }));
      for (const it of items) {
        const err = uniqueViolation(this.table, all, it);
        if (err) return { data: null, error: { message: err } };
      }
      all.push(...items);
      out = items;
    } else if (this.op === "update") {
      out = match();
      for (const r of out) Object.assign(r, this.payload);
    } else if (this.op === "delete") {
      out = match();
      this.db.tables[this.table] = all.filter((r) => !out.includes(r));
    } else {
      out = match();
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    const copy = out.map((r) => ({ ...r }));
    if (this.headCount) return { data: null, error: null, count: copy.length };
    if (this.mode === "single") {
      return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: "not single" } };
    }
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    return { data: this.op === "select" || this.returning ? copy : null, error: null, count: this.wantCount ? copy.length : null };
  }

  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    ok?: ((v: { data: unknown; error: unknown; count?: number | null }) => T1 | PromiseLike<T1>) | null,
    bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

function defaults(table: string): Row {
  if (table === "number_orders") return { status: "pending", attempts: 0, kind: "new", country: "US", error: null, number: null, paid_at: null };
  if (table === "phone_numbers") return { managed: false, status: "active", expires_at: null, telnyx_number_id: null };
  return {};
}

function uniqueViolation(table: string, all: Row[], it: Row): string | null {
  if (table === "phone_numbers" && it.status === "active" && all.some((r) => r.number === it.number && r.status === "active")) {
    return "duplicate key value violates unique constraint phone_numbers_number_active_uniq";
  }
  if (table === "number_orders" && it.coinpay_payment_id && all.some((r) => r.coinpay_payment_id === it.coinpay_payment_id)) {
    return "duplicate coinpay_payment_id";
  }
  return null;
}
