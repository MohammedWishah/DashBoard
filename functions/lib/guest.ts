// Guest mode: the same API, run inside the browser on a local SQLite database (sql.js).
// Nothing here reaches the server. The frontend loads this file only when someone tries the app as a guest.

import type { MiddlewareHandler } from "hono";
import { createApp } from "./app";
import { ensureUser } from "./auth/users";
import { getDb } from "./db";
import type { AppEnv, Bindings } from "./env";

/** The slice of a sql.js Database this file uses, so the server build doesn't need sql.js. */
export type SqlJsDb = {
  exec(sql: string): unknown;
  prepare(sql: string): SqlJsStatement;
  getRowsModified(): number;
};
type SqlJsStatement = {
  bind(params: unknown[]): boolean;
  step(): boolean;
  get(): unknown[];
  getColumnNames(): string[];
  free(): boolean;
};

export const GUEST_ID = "guest";
export const GUEST_EMAIL = "Guest";

type Result = { results: Record<string, unknown>[]; rows: unknown[][]; changes: number };

// sql.js only takes numbers, strings, bytes and null.
const toSql = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

function execute(db: SqlJsDb, sql: string, params: unknown[]): Result {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params.map(toSql));
    const columns = stmt.getColumnNames();
    const rows: unknown[][] = [];
    while (stmt.step()) rows.push(stmt.get());
    // Same shape as D1: rows as objects, where a repeated column name keeps the last value.
    const results = rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    return { results, rows, changes: db.getRowsModified() };
  } finally {
    stmt.free();
  }
}

const d1Result = (r: Result) => ({ results: r.results, success: true, meta: { changes: r.changes } });

type Statement = {
  bind(...params: unknown[]): Statement;
  all(): Promise<ReturnType<typeof d1Result>>;
  raw(): Promise<unknown[][]>;
  first(column?: string): Promise<unknown>;
  run(): Promise<ReturnType<typeof d1Result>>;
  execute(): Result;
};

function statement(db: SqlJsDb, sql: string, params: unknown[] = []): Statement {
  const self: Statement = {
    bind: (...next) => statement(db, sql, next),
    all: async () => d1Result(self.execute()),
    raw: async () => self.execute().rows,
    first: async (column) => {
      const row = self.execute().results[0];
      return row === undefined ? null : column ? row[column] : row;
    },
    run: async () => d1Result(self.execute()),
    execute: () => execute(db, sql, params),
  };
  return self;
}

/** Enough of the D1 binding for drizzle-orm/d1, including batch as one transaction. */
export function d1FromSqlJs(db: SqlJsDb): D1Database {
  const d1 = {
    prepare: (sql: string) => statement(db, sql),
    batch: async (stmts: Statement[]) => {
      db.exec("BEGIN");
      try {
        const results = stmts.map((s) => d1Result(s.execute()));
        db.exec("COMMIT");
        return results;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return d1 as unknown as D1Database;
}

/** Signs every request in as the one local guest, with Money (and its Want list) switched on. */
const guestAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  await ensureUser(getDb(c.env.DB), GUEST_ID, GUEST_EMAIL);
  c.set("userId", GUEST_ID);
  c.set("email", GUEST_EMAIL);
  c.set("isAdmin", false);
  c.set("features", ["money"]);
  c.set("extras", ["wants"]);
  await next();
};

/** A fetch-style handler for `/api/...` requests, answered from the local database. */
export function createGuestApi(db: SqlJsDb): (req: Request) => Promise<Response> {
  const app = createApp(guestAuth);
  const env: Bindings = { DB: d1FromSqlJs(db) };
  return async (req) => app.fetch(req, env);
}
