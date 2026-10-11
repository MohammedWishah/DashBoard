// The guest's local database: sql.js with the real migrations, saved to localStorage after each change.
// Loaded on demand by guest.ts, so none of this is in the main bundle.

import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { createGuestApi } from "@guest-api";

const DATA_KEY = "lifeboard.guest.db";

// The same files the server's D1 database is built from, applied in order.
const migrations = Object.entries(
  import.meta.glob<string>("../../db/migrations/*.sql", { query: "?raw", import: "default", eager: true }),
).sort(([a], [b]) => a.localeCompare(b));

function migrate(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS _guest_migrations (name TEXT PRIMARY KEY)");
  const done = new Set(db.exec("SELECT name FROM _guest_migrations")[0]?.values.map((r) => String(r[0])) ?? []);
  for (const [file, sql] of migrations) {
    const name = file.split("/").pop()!;
    if (done.has(name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.run("INSERT INTO _guest_migrations (name) VALUES (?)", [name]);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

function loadSaved(): Uint8Array | null {
  try {
    const saved = localStorage.getItem(DATA_KEY);
    if (!saved) return null;
    const bin = atob(saved);
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

function save(db: Database) {
  const bytes = db.export();
  // export() reopens the database, which resets pragmas. D1 enforces foreign keys, so we do too.
  db.exec("PRAGMA foreign_keys = ON");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  try {
    localStorage.setItem(DATA_KEY, btoa(bin));
  } catch {
    console.warn("Guest data could not be saved in this browser; it lasts until the tab closes.");
  }
}

async function open() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(loadSaved() ?? undefined);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return { db, handle: createGuestApi(db) };
}

let ready: ReturnType<typeof open> | null = null;

export async function guestHandler(req: Request): Promise<Response> {
  ready ??= open();
  const { db, handle } = await ready;
  const res = await handle(req);
  if (req.method !== "GET") save(db);
  return res;
}

export function wipeGuestData() {
  ready = null;
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {
    // Nothing stored to remove.
  }
}
