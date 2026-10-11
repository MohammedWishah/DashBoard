// Guest mode runs the real API on sql.js in the browser. This runs it the same way in Node.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createGuestApi } from "../functions/lib/guest";
import { berlinMonth } from "../shared/money";

const dir = path.resolve(__dirname, "../db/migrations");
let call: (method: string, p: string, body?: unknown) => Promise<{ status: number; body: any }>;

beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(path.join(dir, f), "utf8"));
  const handle = createGuestApi(db);
  call = async (method, p, body) => {
    const res = await handle(
      new Request(`http://local/api${p}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: await res.json() };
  };
});

describe("guest API", () => {
  it("signs in as the guest with Money only", async () => {
    const me = await call("GET", "/me");
    expect(me.body).toMatchObject({ id: "guest", features: ["money"], extras: ["wants"], isAdmin: false });
    expect((await call("GET", "/projects")).status).toBe(403);
    expect((await call("GET", "/planner/day")).status).toBe(403);
  });

  it("logs an expense and shows it in the overview", async () => {
    const cats = (await call("GET", "/money/categories")).body.categories;
    expect(cats.map((c: { name: string }) => c.name)).toContain("Food");
    const food = cats.find((c: { name: string }) => c.name === "Food");
    const today = new Date().toISOString().slice(0, 10);
    const created = await call("POST", "/money/expenses", { categoryId: food.id, amountCents: 1250, spentOn: today, note: "Lunch" });
    expect(created.status).toBe(201);

    const month = berlinMonth();
    const overview = await call("GET", `/money/overview?month=${month}`);
    expect(overview.status).toBe(200);
    expect(overview.body.recentExpenses[0]).toMatchObject({ note: "Lunch", amountCents: 1250 });

    for (const p of [`/money/charts?month=${month}`, `/money/review?month=${month}`, "/money/suggestions", "/money/bills", "/money/wants"]) {
      expect((await call("GET", p)).status, p).toBe(200);
    }

    expect((await call("DELETE", `/money/expenses/${created.body.expense.id}`)).status).toBe(200);
    expect((await call("GET", `/money/overview?month=${month}`)).body.recentExpenses).toHaveLength(0);
  });

  it("saves toward a goal", async () => {
    const goal = (await call("POST", "/money/goals", { name: "Trip", targetCents: 50000 })).body.goal;
    const today = new Date().toISOString().slice(0, 10);
    expect((await call("POST", `/money/goals/${goal.id}/contributions`, { amountCents: 1000, onDate: today })).status).toBe(201);
    expect((await call("GET", `/money/goals/${goal.id}/contributions`)).body.contributions).toHaveLength(1);
  });
});
