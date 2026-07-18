/**
 * Minimal Supabase-JS-compatible query builder, backed by Neon Postgres
 * instead of Supabase's hosted PostgREST API.
 *
 * Why a shim instead of rewriting every call site to typed Drizzle queries:
 * server/*.ts has ~90 `supabase.from(table)....` call sites across 6 files.
 * Rewriting each one by hand to Drizzle's query builder is a much larger,
 * higher-risk change with no way to test against a live DB in this sandbox.
 * This shim implements exactly the subset of the PostgREST client API this
 * codebase actually uses (grep-verified against server/*.ts), translated to
 * parameterised SQL. Table/column names come only from static string
 * literals already in the codebase (never from user input), but they're
 * still validated against a strict identifier allowlist as defense in depth.
 *
 * `server/db.ts` (the typed Drizzle schema + connection) is the better path
 * for any *new* code — reach for that instead of extending this shim.
 */
import { sql as pgSql } from "./db";

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "in" | "ilike";
interface Filter {
  col: string;
  op: FilterOp;
  val: any;
}
interface OrderClause {
  col: string;
  ascending: boolean;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertIdent(name: string, kind = "identifier"): string {
  if (!IDENT_RE.test(name)) throw new Error(`Unsafe ${kind}: ${name}`);
  return name;
}
function quoteIdent(name: string): string {
  assertIdent(name);
  return `"${name}"`;
}

// jsonb / array values need to travel as JSON text, otherwise postgres-js
// sends plain JS objects as text and Postgres throws a 42804 type error.
function toParam(val: any): any {
  if (val !== null && typeof val === "object" && !(val instanceof Date)) {
    return JSON.stringify(val);
  }
  return val;
}

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

export interface SupaResult<T = any> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

class QueryBuilder<T = any> implements PromiseLike<SupaResult<T>> {
  private table: string;
  private mode: Mode = "select";
  private selectCols = "*";
  private countOpt: "exact" | null = null;
  private headOnly = false;
  private filters: Filter[] = [];
  private orClauses: string[] = [];
  private orderClauses: OrderClause[] = [];
  private limitN: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private insertRows: any[] | null = null;
  private updatePatch: Record<string, any> | null = null;
  private upsertRows: any[] | null = null;
  private upsertConflictCols: string[] | null = null;
  private upsertIgnoreDup = false;
  // Whether to RETURNING on writes. supabase-js insert()/upsert() return the
  // written rows by default; update()/delete() only do when .select() is
  // chained. select() itself always implies it (it's the read path).
  private returning = false;

  constructor(table: string) {
    this.table = assertIdent(table, "table");
  }

  select(cols: string = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.selectCols = cols;
    if (opts?.count) this.countOpt = opts.count;
    if (opts?.head) this.headOnly = true;
    this.returning = true;
    return this;
  }

  insert(rows: any | any[]) {
    this.mode = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.returning = true;
    return this;
  }

  update(patch: Record<string, any>) {
    this.mode = "update";
    this.updatePatch = patch;
    return this;
  }

  upsert(rows: any | any[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.upsertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertConflictCols = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
    this.upsertIgnoreDup = !!opts?.ignoreDuplicates;
    this.returning = true;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push({ col, op: "neq", val });
    return this;
  }
  gt(col: string, val: any) {
    this.filters.push({ col, op: "gt", val });
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push({ col, op: "gte", val });
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push({ col, op: "lt", val });
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push({ col, op: "lte", val });
    return this;
  }
  is(col: string, _val: null) {
    this.filters.push({ col, op: "is", val: null });
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  ilike(col: string, pattern: string) {
    this.filters.push({ col, op: "ilike", val: pattern });
    return this;
  }

  // Only supports the one shape actually used in this codebase:
  // "col.ilike.%x%,col2.ilike.%x%,..." — comma-separated ORs, all ilike.
  or(expr: string) {
    this.orClauses.push(expr);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderClauses.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  private buildWhere(startIdx: number): { text: string; params: any[] } {
    const parts: string[] = [];
    const params: any[] = [];
    let i = startIdx;
    for (const f of this.filters) {
      const col = quoteIdent(f.col);
      switch (f.op) {
        case "eq":
          parts.push(`${col} = $${i++}`);
          params.push(f.val);
          break;
        case "neq":
          parts.push(`${col} <> $${i++}`);
          params.push(f.val);
          break;
        case "gt":
          parts.push(`${col} > $${i++}`);
          params.push(f.val);
          break;
        case "gte":
          parts.push(`${col} >= $${i++}`);
          params.push(f.val);
          break;
        case "lt":
          parts.push(`${col} < $${i++}`);
          params.push(f.val);
          break;
        case "lte":
          parts.push(`${col} <= $${i++}`);
          params.push(f.val);
          break;
        case "is":
          parts.push(`${col} IS NULL`);
          break;
        case "in": {
          if (!f.val.length) {
            parts.push("false");
            break;
          }
          const placeholders = f.val.map(() => `$${i++}`).join(", ");
          parts.push(`${col} IN (${placeholders})`);
          params.push(...f.val);
          break;
        }
        case "ilike":
          parts.push(`${col} ILIKE $${i++}`);
          params.push(f.val);
          break;
      }
    }
    for (const orExpr of this.orClauses) {
      const orParts: string[] = [];
      for (const clause of orExpr.split(",")) {
        const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\.ilike\.(.*)$/.exec(clause.trim());
        if (!m) throw new Error(`Unsupported .or() clause: ${clause}`);
        orParts.push(`${quoteIdent(m[1])} ILIKE $${i++}`);
        params.push(m[2]);
      }
      parts.push(`(${orParts.join(" OR ")})`);
    }
    return { text: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
  }

  private async execute(): Promise<SupaResult> {
    try {
      if (this.mode === "select") return await this.execSelect();
      if (this.mode === "insert") return await this.execInsert();
      if (this.mode === "update") return await this.execUpdate();
      if (this.mode === "upsert") return await this.execUpsert();
      if (this.mode === "delete") return await this.execDelete();
      throw new Error(`Unknown mode ${this.mode}`);
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? String(err) } };
    }
  }

  private async execSelect(): Promise<SupaResult> {
    const { text: whereClause, params } = this.buildWhere(1);
    const cols = this.headOnly ? "1" : this.selectCols;
    let query = `SELECT ${cols} FROM ${quoteIdent(this.table)} ${whereClause}`;
    if (this.orderClauses.length) {
      query +=
        " ORDER BY " +
        this.orderClauses.map((o) => `${quoteIdent(o.col)} ${o.ascending ? "ASC" : "DESC"}`).join(", ");
    }
    if (this.limitN != null) query += ` LIMIT ${this.limitN}`;
    const rows = await pgSql.unsafe(query, params);

    let count: number | null = null;
    if (this.countOpt === "exact") {
      const countQuery = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(this.table)} ${whereClause}`;
      const countRows = await pgSql.unsafe(countQuery, params);
      count = (countRows[0] as any)?.count ?? 0;
    }

    if (this.headOnly) return { data: null, error: null, count };

    const list = [...rows];
    if (this.singleMode === "single") {
      if (list.length !== 1)
        return { data: null, error: { message: `Expected exactly one row, got ${list.length}` } };
      return { data: list[0] as any, error: null, count };
    }
    if (this.singleMode === "maybeSingle") {
      if (list.length > 1) return { data: null, error: { message: `Expected 0 or 1 rows, got ${list.length}` } };
      return { data: (list[0] as any) ?? null, error: null, count };
    }
    return { data: list as any, error: null, count };
  }

  private async execInsert(): Promise<SupaResult> {
    const rows = this.insertRows!;
    if (!rows.length) return { data: this.singleMode ? null : [], error: null };
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => quoteIdent(c)).join(", ");
    const params: any[] = [];
    let i = 1;
    const valueTuples = rows.map((row) => {
      const tuple = cols.map((c) => {
        params.push(toParam(row[c]));
        return `$${i++}`;
      });
      return `(${tuple.join(", ")})`;
    });
    let query = `INSERT INTO ${quoteIdent(this.table)} (${colList}) VALUES ${valueTuples.join(", ")}`;
    if (this.returning) query += ` RETURNING ${this.selectCols}`;
    const result = await pgSql.unsafe(query, params);
    return this.shapeWriteResult([...result]);
  }

  private async execUpdate(): Promise<SupaResult> {
    const patch = this.updatePatch!;
    const cols = Object.keys(patch);
    if (!cols.length) return { data: null, error: { message: "update() called with no fields" } };
    const setParts: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const c of cols) {
      setParts.push(`${quoteIdent(c)} = $${i++}`);
      params.push(toParam(patch[c]));
    }
    const { text: whereClause, params: whereParams } = this.buildWhere(i);
    params.push(...whereParams);
    let query = `UPDATE ${quoteIdent(this.table)} SET ${setParts.join(", ")} ${whereClause}`;
    if (this.returning) query += ` RETURNING ${this.selectCols}`;
    const result = await pgSql.unsafe(query, params);
    return this.shapeWriteResult([...result]);
  }

  private async execUpsert(): Promise<SupaResult> {
    const rows = this.upsertRows!;
    if (!rows.length) return { data: [], error: null };
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => quoteIdent(c)).join(", ");
    const params: any[] = [];
    let i = 1;
    const valueTuples = rows.map((row) => {
      const tuple = cols.map((c) => {
        params.push(toParam(row[c]));
        return `$${i++}`;
      });
      return `(${tuple.join(", ")})`;
    });
    const conflictCols = this.upsertConflictCols ?? ["id"];
    const conflictList = conflictCols.map((c) => quoteIdent(c)).join(", ");
    let action: string;
    if (this.upsertIgnoreDup) {
      action = "DO NOTHING";
    } else {
      const updateCols = cols.filter((c) => !conflictCols.includes(c));
      action = updateCols.length
        ? `DO UPDATE SET ${updateCols.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`
        : "DO NOTHING";
    }
    let query = `INSERT INTO ${quoteIdent(this.table)} (${colList}) VALUES ${valueTuples.join(
      ", ",
    )} ON CONFLICT (${conflictList}) ${action}`;
    if (this.returning) query += ` RETURNING ${this.selectCols}`;
    const result = await pgSql.unsafe(query, params);
    return this.shapeWriteResult([...result]);
  }

  private async execDelete(): Promise<SupaResult> {
    const { text: whereClause, params } = this.buildWhere(1);
    let query = `DELETE FROM ${quoteIdent(this.table)} ${whereClause}`;
    if (this.returning) query += ` RETURNING ${this.selectCols}`;
    const result = await pgSql.unsafe(query, params);
    return this.shapeWriteResult([...result]);
  }

  private shapeWriteResult(list: any[]): SupaResult {
    if (this.singleMode === "single") {
      if (list.length !== 1)
        return { data: null, error: { message: `Expected exactly one row, got ${list.length}` } };
      return { data: list[0] as any, error: null };
    }
    if (this.singleMode === "maybeSingle") {
      if (list.length > 1) return { data: null, error: { message: `Expected 0 or 1 rows, got ${list.length}` } };
      return { data: (list[0] as any) ?? null, error: null };
    }
    return { data: list as any, error: null };
  }

  // Typed as returning a real Promise (not just PromiseLike) so chains like
  // `supabase.from(x).upsert(y).then(cb).catch(errCb)` — used in routes.ts
  // for fire-and-forget writes — type-check the same way they did against
  // the real supabase-js client, which is also a thenable backed by a Promise.
  then<TResult1 = SupaResult, TResult2 = never>(
    onfulfilled?: ((value: SupaResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  catch(onrejected?: (reason: any) => any) {
    return this.execute().catch(onrejected);
  }
}

export class SupabaseCompatClient {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table);
  }

  /**
   * Minimal RPC support — only the two Postgres functions this app actually
   * calls (see migrations/0001_functions.sql for their definitions).
   */
  async rpc(fnName: string, args: Record<string, any> = {}): Promise<SupaResult> {
    assertIdent(fnName, "function");
    try {
      const argNames = Object.keys(args);
      const params = argNames.map((k) => toParam(args[k]));
      const argList = argNames.map((k, idx) => `${quoteIdent(k)} := $${idx + 1}`).join(", ");
      const query = `SELECT * FROM ${quoteIdent(fnName)}(${argList})`;
      const rows = await pgSql.unsafe(query, params);
      return { data: [...rows] as any, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? String(err) } };
    }
  }
}

export const supabase = new SupabaseCompatClient();
