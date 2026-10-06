# Cleanup + Habit Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all deferred review minors, and add three Planner extras: tiny versions, time of day, and energy check-in.

**Architecture:** One migration (0006) adds:
- habit columns `tiny`, `time_of_day`, `archived_at`
- the `energy_checkins` table
- a categories unique index

New pure logic goes in `shared/energy.ts`, plus small changes to `shared/planner.ts`, `shared/briefing.ts` and `shared/money.ts`, all unit-tested. Server changes are thin and isolation-checked. UI changes appear only behind `useHasExtra`.

**Tech Stack:** As before: Hono, Drizzle/D1, Zod, Vitest, React 19, TanStack Query, Tailwind, sonner, Python stdlib.

**Spec:** `docs/superpowers/specs/2026-10-07-cleanup-and-habit-extras-design.md`

## Global Constraints

- New extras: `tiny_habits`, `time_of_day`, `energy`. All need `planner`, and all are default off.
- `timeOfDay` ∈ `morning | afternoon | evening | any`, default `any`. `tiny` is at most 80 chars, nullable. Energy `level` ∈ `low | ok | high`.
- Energy insight thresholds: a 60-day window, ≥ 14 check-ins, ≥ 3 high and ≥ 3 low days, ≥ 3 eligible days per group per habit, and a difference of ≥ 20 points.
- Every query is scoped by `user_id`. Another user's id gives 404.
- An extra that's off changes nothing in the UI or the payloads. Its routes return 403 `extra_disabled`.
- Write files containing backslashes with the Write/Edit tools, or with Python strings using `chr(92)`, never with shell heredocs.

## Review Focus

1. Restoring a habit clears `archived_at`. Re-archiving later sets a new date, and the chart uses the latest one.
2. An energy check-in for tomorrow returns 400. Overwriting today's level replaces it (upsert), not a second row.
3. Importing an older v3 file without `wants`/`energy` must not delete the person's current wants or energy.
4. The evening brief with only the energy line must still send. With energy logged and nothing open, it must be silent.
5. Undo on Skip within 5 seconds must leave the want untouched on the server (no API call made).

---

### Task 1: Migration 0006 and extras keys

**Files:** `shared/features.ts`, `shared/features.test.ts`, `db/schema.ts`, generated `db/migrations/0006_*.sql`

- [ ] **Step 1: Test the new extras (RED)**

Append to `shared/features.test.ts`:

```ts
describe("habit extras", () => {
  it("need Planner", () => {
    expect(effectiveExtras(["tiny_habits", "time_of_day", "energy"], ["planner"])).toEqual(["tiny_habits", "time_of_day", "energy"]);
    expect(effectiveExtras(["tiny_habits", "time_of_day", "energy"], ["money"])).toEqual([]);
  });
});
```

Run: `npx vitest run shared/features.test.ts`. Expected: FAIL (the result is `[]` in the first case).

- [ ] **Step 2: Add the keys (GREEN)**

In `shared/features.ts`:
- Extend `EXTRAS` to `["home_today", "kind_streaks", "wins", "wants", "nudges", "tiny_habits", "time_of_day", "energy"]`.
- Labels: `tiny_habits: "Tiny versions"`, `time_of_day: "Time of day"`, `energy: "Energy check-in"`.
- Requires: all three `"planner"`.

Run the test. Expected: PASS.

- [ ] **Step 3: Schema**

In `db/schema.ts`, in the `habits` columns, add after `archived`:

```ts
    tiny: text("tiny"),
    timeOfDay: text("time_of_day", { enum: ["morning", "afternoon", "evening", "any"] }).notNull().default("any"),
    archivedAt: text("archived_at"),
```

Append to the Planner section:

```ts
export const energyCheckins = sqliteTable(
  "energy_checkins",
  {
    userId: owner(),
    day: text("day").notNull(),
    level: text("level", { enum: ["low", "ok", "high"] }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
```

In `categories`, change the table callback to:

```ts
  (t) => [index("categories_user_idx").on(t.userId), uniqueIndex("categories_user_name_unique").on(t.userId, sql`lower(${t.name})`)],
```

Run: `npx drizzle-kit generate --name habit_extras && npm run db:migrate:local`.
Expected: `0006_habit_extras.sql` with 3 `ALTER TABLE habits ADD`, a `CREATE TABLE energy_checkins` and a `CREATE UNIQUE INDEX categories_user_name_unique`, applied locally.

If drizzle-kit can't express the `lower()` index, write the index line into the SQL by hand (`CREATE UNIQUE INDEX \`categories_user_name_unique\` ON \`categories\` (\`user_id\`, lower(\`name\`));`), keep the schema index definition, and ledger a ruling.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test`.

Commit: `Habit extras: keys and migration 0006 (tiny, time of day, archived_at, energy, unique category names)`.

---

### Task 2: Shared rules (energy insight, archive cutoff, speakEuro, briefings)

**Files:**
- Create: `shared/energy.ts`, `shared/energy.test.ts`
- Modify: `shared/planner.ts`, `shared/planner.test.ts`, `shared/money.ts`, `shared/money.test.ts`, `shared/briefing.ts`, `shared/briefing.test.ts`, `shared/wins.ts`

**Interfaces:**
- Produces:
  - `type EnergyLevel = "low" | "ok" | "high"`
  - `ENERGY_LEVELS`
  - `energyInsight(checkins: { day: string; level: EnergyLevel }[], habits: { name: string; createdOn: string; checks: ReadonlySet<string> }[], today: string): { habit: string; highPct: number; lowPct: number } | null`
  - `insightText(i): string`
  - `dayPercents` accepts `archivedOn?: string | null`
  - `TIMES_OF_DAY`, `type TimeOfDay`
  - `BriefingInput` gains `timeOfDay: boolean`, `energyAsk: boolean` and `insight: string | null`; habits gain `timeOfDay: TimeOfDay`; wins habits gain `possible: number`
  - `WinsView` gains `insight: string | null` and `habits[].possible`

- [ ] **Step 1: Energy tests (RED), `shared/energy.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { addDays } from "./planner";
import { energyInsight, insightText, type EnergyLevel } from "./energy";

const today = "2026-10-31";
/** n days back from today, oldest first, with a level per day from `pattern` (cycled). */
function checkins(n: number, pattern: EnergyLevel[]) {
  return Array.from({ length: n }, (_, i) => ({ day: addDays(today, -(n - 1 - i)), level: pattern[i % pattern.length] }));
}

describe("energyInsight", () => {
  it("needs 14 check-ins", () => {
    const c = checkins(13, ["high", "low"]);
    const read = { name: "Read", createdOn: "2026-01-01", checks: new Set(c.filter((x) => x.level === "high").map((x) => x.day)) };
    expect(energyInsight(c, [read], today)).toBeNull();
  });
  it("needs 3 high and 3 low days", () => {
    const c = checkins(20, ["ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "high"]);
    expect(energyInsight(c, [{ name: "Read", createdOn: "2026-01-01", checks: new Set() }], today)).toBeNull();
  });
  it("picks the habit with the biggest gap", () => {
    const c = checkins(20, ["high", "low"]);
    const highDays = c.filter((x) => x.level === "high").map((x) => x.day);
    const lowDays = c.filter((x) => x.level === "low").map((x) => x.day);
    const read = { name: "Read", createdOn: "2026-01-01", checks: new Set(highDays) }; // 100 vs 0
    const water = { name: "Water", createdOn: "2026-01-01", checks: new Set([...highDays, ...lowDays.slice(0, 5)]) }; // 100 vs 50
    expect(energyInsight(c, [water, read], today)).toEqual({ habit: "Read", highPct: 100, lowPct: 0 });
  });
  it("ignores small gaps and days before the habit existed", () => {
    const c = checkins(20, ["high", "low"]);
    const all = new Set(c.map((x) => x.day));
    expect(energyInsight(c, [{ name: "Water", createdOn: "2026-01-01", checks: all }], today)).toBeNull();
    // created yesterday: fewer than 3 eligible days per group
    expect(energyInsight(c, [{ name: "New", createdOn: addDays(today, -1), checks: all }], today)).toBeNull();
  });
});

describe("insightText", () => {
  it("reads naturally both ways", () => {
    expect(insightText({ habit: "Read", highPct: 82, lowPct: 40 })).toBe("On high-energy days you do Read 82% of the time, on low days 40%.");
    expect(insightText({ habit: "Walk", highPct: 30, lowPct: 60 })).toBe("On low-energy days you do Walk more (60%) than on high days (30%).");
  });
});
```

Run: `npx vitest run shared/energy.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: `shared/energy.ts` (GREEN)**

```ts
// Energy check-in: one level a day, and a gentle pattern once there's enough data. Pure.

import { addDays } from "./planner";

export const ENERGY_LEVELS = ["low", "ok", "high"] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];
export type EnergyInsight = { habit: string; highPct: number; lowPct: number };

const WINDOW_DAYS = 60;
const MIN_CHECKINS = 14;
const MIN_PER_GROUP = 3;
const MIN_GAP = 20;

export function energyInsight(
  checkins: { day: string; level: EnergyLevel }[],
  habits: { name: string; createdOn: string; checks: ReadonlySet<string> }[],
  today: string,
): EnergyInsight | null {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const recent = checkins.filter((c) => c.day >= from && c.day <= today);
  const high = recent.filter((c) => c.level === "high").map((c) => c.day);
  const low = recent.filter((c) => c.level === "low").map((c) => c.day);
  if (recent.length < MIN_CHECKINS || high.length < MIN_PER_GROUP || low.length < MIN_PER_GROUP) return null;

  let best: EnergyInsight | null = null;
  for (const h of habits) {
    const hi = high.filter((d) => d >= h.createdOn);
    const lo = low.filter((d) => d >= h.createdOn);
    if (hi.length < MIN_PER_GROUP || lo.length < MIN_PER_GROUP) continue;
    const pct = (days: string[]) => Math.round((100 * days.filter((d) => h.checks.has(d)).length) / days.length);
    const candidate = { habit: h.name, highPct: pct(hi), lowPct: pct(lo) };
    const gap = Math.abs(candidate.highPct - candidate.lowPct);
    if (gap >= MIN_GAP && (!best || gap > Math.abs(best.highPct - best.lowPct))) best = candidate;
  }
  return best;
}

export function insightText(i: EnergyInsight): string {
  return i.highPct >= i.lowPct
    ? `On high-energy days you do ${i.habit} ${i.highPct}% of the time, on low days ${i.lowPct}%.`
    : `On low-energy days you do ${i.habit} more (${i.lowPct}%) than on high days (${i.highPct}%).`;
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Archive cutoff in `dayPercents` (RED → GREEN)**

Append to `shared/planner.test.ts`, in the `percentages` describe or a new one:

```ts
describe("dayPercents with archived habits", () => {
  it("counts an archived habit only before its archive day", () => {
    const habits = [
      { id: "a", createdOn: "2026-09-01", archivedOn: "2026-10-03" },
      { id: "b", createdOn: "2026-09-01", archivedOn: null },
    ];
    const checks = new Map([
      ["a", new Set(["2026-10-01", "2026-10-02"])],
      ["b", new Set(["2026-10-01", "2026-10-03"])],
    ]);
    const d = dayPercents(habits, checks, "2026-10", "2026-10-03");
    expect(d[0].percent).toBe(100); // both
    expect(d[1].percent).toBe(50); // a yes, b no
    expect(d[2].percent).toBe(100); // only b counts from the 3rd
  });
});
```

RED: `archivedOn` is ignored, so day 3 gives 50. Implement by changing the `dayPercents` habit type to `{ id: string; createdOn: string; archivedOn?: string | null }` and the eligibility filter to:

```ts
    const eligible = habits.filter((h) => h.createdOn <= date && (!h.archivedOn || date < h.archivedOn));
```

Also export from `shared/planner.ts`:

```ts
export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "any"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
```

- [ ] **Step 4: `speakEuro` under €1 (RED → GREEN)**

Append to `shared/money.test.ts` (import `speakEuro`):

```ts
describe("speakEuro", () => {
  it("never says 0 euros for a non-zero amount", () => {
    expect(speakEuro(50)).toBe("less than 1 euro");
    expect(speakEuro(-50)).toBe("less than 1 euro");
    expect(speakEuro(0)).toBe("0 euros");
    expect(speakEuro(100)).toBe("1 euro");
    expect(speakEuro(41250)).toBe("412 euros");
  });
});
```

Implementation: in `speakEuro`, first line `if (cents !== 0 && Math.abs(cents) < 100) return "less than 1 euro";`.

- [ ] **Step 5: Briefing changes (RED → GREEN)**

In `shared/briefing.ts`:
- `Habit` gains `timeOfDay: TimeOfDay`.
- `BriefingInput` gains `timeOfDay: boolean`, `energyAsk: boolean` and `insight: string | null`.
- `wins.habits` items gain `possible: number`.

Update `shared/briefing.test.ts`:
- `base` gains `timeOfDay: false, energyAsk: false, insight: null`.
- Every habit literal gains `timeOfDay: "any"`.
- Every wins habit gains `possible` (Read: `possible: 7`, Gym: `possible: 1`).

Then add these tests:

```ts
describe("time of day and energy", () => {
  const h = (name: string, timeOfDay: "morning" | "afternoon" | "evening" | "any", checked = false) => ({
    name,
    checked,
    streak: 0,
    atRisk: false,
    frequency: "daily" as const,
    timeOfDay,
  });
  it("morning lists morning habits first", () => {
    expect(morningMessage({ ...base, tasks: null, timeOfDay: true, daily: [h("Read", "evening"), h("Stretch", "morning"), h("Water", "any")] })).toBe(
      "Good morning. Morning habits: Stretch. Later: Read, Water.",
    );
  });
  it("evening asks for energy when not logged, even with nothing else open", () => {
    expect(eveningMessage({ ...base, tasks: [], energyAsk: true })).toBe('Evening check.\nEnergy today? Reply "energy low", "ok" or "high".');
  });
  it("evening stays silent when energy is logged and nothing is open", () => {
    expect(eveningMessage({ ...base, tasks: [], energyAsk: false })).toBe("");
  });
  it("weekly: singular win, count/possible, insight", () => {
    expect(
      weeklyMessage({
        ...base,
        insight: "On high-energy days you do Read 82% of the time, on low days 40%.",
        wins: { total: 1, tasksDone: 0, habits: [{ name: "Read", count: 1, possible: 3, frequency: "daily" }], shipped: [], noSpendDays: 0, dailyPercent: null },
      }),
    ).toBe("Week in review: 1 win. Read 1/3.\nOn high-energy days you do Read 82% of the time, on low days 40%.");
  });
});
```

Implementation changes:

**`morningMessage` habit line,** when `i.timeOfDay`:

```ts
    const open = i.daily.filter((x) => !x.checked);
    const morning = open.filter((x) => x.timeOfDay === "morning");
    const later = open.filter((x) => x.timeOfDay !== "morning");
    const parts = [
      morning.length > 0 ? `Morning habits: ${names(morning)}.` : null,
      later.length > 0 ? `Later: ${names(later)}.` : null,
      ...weeklyMonthlyParts,
    ].filter(Boolean);
```

`weeklyMonthlyParts` are the existing "This week" / "This month" parts. When `timeOfDay` is false, keep the current output exactly.

**`eveningMessage`:**
- Replace the planner-off early return with: `if (!i.tasks && !i.energyAsk) return "";`.
- Treat `i.tasks ?? []`.
- After the at-risk lines, add: `if (i.energyAsk) lines.push('Energy today? Reply "energy low", "ok" or "high".');`.

**`weeklyMessage`:**
- `${w.total} win${w.total === 1 ? "" : "s"}`.
- Daily habits show `${h.name} ${h.count}/${h.possible}`; weekly stays `✓`.
- After the daily-percent line, `if (i.insight) lines.push(i.insight);`.

In `shared/wins.ts`: `WinsView.habits` items gain `possible: number`, and `WinsView` gains `insight: string | null`.

Run: `npm test`. Expected: all PASS (old briefing tests were updated only with the new fields).

- [ ] **Step 6: Commit**

Commit: `Shared rules: energy insight, archive cutoff, speakEuro under €1, briefing time-of-day and energy`.

---

### Task 3: Planner and energy backend

**Files:**
- `shared/planner-schemas.ts`
- `functions/lib/services/planner.ts`
- `functions/lib/services/wins.ts`
- `functions/lib/services/briefing.ts`
- `functions/lib/services/planner-agent.ts`
- `functions/lib/routes/planner.ts`
- `functions/lib/routes/agent.ts`
- `functions/lib/app.ts`
- `scripts/isolation-check.mjs`

**Interfaces:**
- `HabitRow` gains `tiny: string | null`, `timeOfDay: TimeOfDay` and `archivedAt: string | null`.
- `habitCreateSchema` and `habitUpdateSchema` gain `tiny` (`z.string().trim().max(80).nullable().optional()`, with `""` turned into null) and `timeOfDay: z.enum(TIMES_OF_DAY)` (optional; create defaults to `"any"`).
- `habitOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(110) })`
- `energyPutSchema = z.object({ level: z.enum(ENERGY_LEVELS) })`
- `agentEnergySchema = z.object({ level: z.enum(ENERGY_LEVELS), date: dateSchema.optional() })`
- `DayView` gains `energy: EnergyLevel | null`.
- Service:
  - `reorderHabits(db, userId, ids)`
  - `setEnergy(db, userId, day, level | null, today?)`
  - `getEnergy(db, userId, day)`
  - `listEnergy(db, userId, from, to)`
  - `getDay(db, userId, date?, now?, kind?, energy?: boolean)`

- [ ] **Step 1: Isolation checks (RED)**

Insert after the forgiving-streak block in `scripts/isolation-check.mjs`:

```js
// ---- habit extras + energy
const tinyHabit = await bob("POST", "/planner/habits", { name: `Stretch ${run}`, frequency: "daily", tiny: "One stretch", timeOfDay: "morning" });
check("habit keeps tiny and time of day", tinyHabit.status === 201 && tinyHabit.body?.habit?.tiny === "One stretch" && tinyHabit.body?.habit?.timeOfDay === "morning", JSON.stringify(tinyHabit.body));
const cleared = await bob("PATCH", `/planner/habits/${tinyHabit.body?.habit?.id}`, { tiny: "" });
check("empty tiny clears it", cleared.body?.habit?.tiny === null, JSON.stringify(cleared.body));
const bobHabitIds = (await bob("GET", "/planner/habits")).body.habits.map((h) => h.id);
check("reorder own habits", (await bob("PUT", "/planner/habits/order", { ids: [...bobHabitIds].reverse() })).status === 200);
check("reorder with someone else's id (404)", (await bob("PUT", "/planner/habits/order", { ids: [oh] })).status === 404);
check("energy off: 403", (await bob("PUT", `/planner/energy/${today}`, { level: "high" })).status === 403);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today", "tiny_habits", "time_of_day", "energy"] });
check("energy for today", (await bob("PUT", `/planner/energy/${today}`, { level: "low" })).status === 200);
check("energy overwrite is an upsert", (await bob("PUT", `/planner/energy/${today}`, { level: "high" })).status === 200 && (await bob("GET", `/planner/day?date=${today}`)).body?.energy === "high");
check("energy for tomorrow (400)", (await bob("PUT", `/planner/energy/${tomorrow}`, { level: "ok" })).status === 400);
check("owner's day has no Bob energy", (await owner("GET", `/planner/day?date=${today}`)).body?.energy !== "high" || true);
const agentEnergy = await agent("POST", "/agent/planner/energy", { level: "ok" });
check("agent logs energy", agentEnergy.status === 200 && agentEnergy.body?.speech === "Logged energy: ok for today.", JSON.stringify(agentEnergy.body));
await owner("PATCH", `/planner/habits/${oh}`, { archived: true });
const archivedRow = (await owner("GET", "/planner/habits")).body.habits.find((h) => h.id === oh);
check("archiving stamps archivedAt", typeof archivedRow?.archivedAt === "string");
await owner("PATCH", `/planner/habits/${oh}`, { archived: false });
check("restoring clears archivedAt", (await owner("GET", "/planner/habits")).body.habits.find((h) => h.id === oh)?.archivedAt === null);
```

The owner-energy line is a placeholder-free sanity read. Replace it with a precise check: first set the owner's energy to `"low"` with `owner("PUT", …)` (the owner has all extras from Task 1 of the extras plan), then assert that Bob's `"high"` didn't overwrite it:

```js
await owner("PUT", `/planner/energy/${today}`, { level: "low" });
check("energy is per person", (await owner("GET", `/planner/day?date=${today}`)).body?.energy === "low" && (await bob("GET", `/planner/day?date=${today}`)).body?.energy === "ok");
```

Use this pair instead of the `|| true` line, which must not be committed. Bob's energy is `"ok"` here because the agent call above set it.

Start the API if the user allows (`npm run dev:api`), and run the script. Expected: the new checks FAIL. If the server can't run, ledger it and continue.

- [ ] **Step 2: Schemas and types**

`shared/planner-schemas.ts`:
- Import `TIMES_OF_DAY`, `type TimeOfDay`, `ENERGY_LEVELS`, `type EnergyLevel`.
- `HabitRow` adds the 3 fields.
- Create:

```ts
const tiny = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v));
export const habitCreateSchema = z.object({ name: habitName, frequency: frequencySchema, tiny, timeOfDay: z.enum(TIMES_OF_DAY).default("any") });
export const habitUpdateSchema = z
  .object({ name: habitName, sortOrder: z.number().int().min(0), archived: z.boolean(), tiny, timeOfDay: z.enum(TIMES_OF_DAY) })
  .partial()
  .strict();
export const habitOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(110) });
export const energyPutSchema = z.object({ level: z.enum(ENERGY_LEVELS) });
export const agentEnergySchema = z.object({ level: z.enum(ENERGY_LEVELS), date: dateSchema.optional() });
```

- `HabitCreate` must use `z.input` for the UI (`timeOfDay` optional): export `type HabitCreateInput = z.input<typeof habitCreateSchema>` and use it in `plannerApi.createHabit`.
- `DayView` adds `energy: EnergyLevel | null`.
- `plannerExportSchema.habits` items gain `tiny: z.string().max(80).nullable().optional()`, `timeOfDay: z.enum(TIMES_OF_DAY).optional()` and `archivedAt: isoDateTime.nullable().optional()`. These are optional so older v3 files still import.
- Add `energy: z.array(z.object({ day: dateSchema, level: z.enum(ENERGY_LEVELS), updatedAt: isoDateTime })).optional()` to `plannerExportSchema`.

- [ ] **Step 3: Service, `functions/lib/services/planner.ts`**

- **`createHabit`:** the row adds `tiny: input.tiny ?? null`, `timeOfDay: input.timeOfDay ?? "any"` and `archivedAt: null`.
- **`updateHabit`:** build the patch as `{ ...patch, ...(patch.archived === true && !habit.archived && { archivedAt: nowIso() }), ...(patch.archived === false && { archivedAt: null }) }`.
- **`reorderHabits`:**

```ts
export async function reorderHabits(db: Db, userId: string, ids: string[]) {
  const mine = new Set((await listHabits(db, userId)).map((h) => h.id));
  const unknown = ids.find((id) => !mine.has(id));
  if (unknown) throw notFound("Habit");
  await db.batch(
    ids.map((id, i) => db.update(habits).set({ sortOrder: i }).where(and(eq(habits.id, id), eq(habits.userId, userId)))) as [any, ...any[]],
  );
  return listHabits(db, userId);
}
```

The `as [any, ...any[]]` cast matches `db.batch`'s tuple type; use `BatchItem<"sqlite">` like `transfer.ts` if you prefer.

- **Energy:**

```ts
export async function getEnergy(db: Db, userId: string, day: string): Promise<EnergyLevel | null> {
  const row = await db.select({ level: energyCheckins.level }).from(energyCheckins).where(and(eq(energyCheckins.userId, userId), eq(energyCheckins.day, day))).get();
  return row?.level ?? null;
}

export async function setEnergy(db: Db, userId: string, day: string, level: EnergyLevel | null, today = berlinToday()) {
  if (day > today) throw new ApiError(400, "future_day", "You can only log energy for today or earlier");
  const where = and(eq(energyCheckins.userId, userId), eq(energyCheckins.day, day));
  if (level === null) await db.delete(energyCheckins).where(where);
  else
    await db
      .insert(energyCheckins)
      .values({ userId, day, level, updatedAt: nowIso() })
      .onConflictDoUpdate({ target: [energyCheckins.userId, energyCheckins.day], set: { level, updatedAt: nowIso() } });
  return { day, level };
}

export const listEnergy = (db: Db, userId: string, from: string, to: string) =>
  db
    .select({ day: energyCheckins.day, level: energyCheckins.level })
    .from(energyCheckins)
    .where(and(eq(energyCheckins.userId, userId), between(energyCheckins.day, from, to)));
```

- **`getDay`:** the signature gains `energy = false`. The returned object adds `energy: energy ? await getEnergy(db, userId, day) : null`.
- **`getMonth`:** compute `dayPercents` from **all** daily habits, archived included, with `archivedOn`:

```ts
  const all = await listHabits(db, userId);
  const active = all.filter((h) => !h.archived);
  const dailyAll = all.filter((h) => h.frequency === "daily");
  const checks = await checksByHabit(db, userId, [...new Set([...active, ...dailyAll].map((h) => h.id))]);
  …
  dayPercents: dayPercents(
    dailyAll.map((h) => ({ id: h.id, createdOn: created(h), archivedOn: h.archived && h.archivedAt ? createdDay(h.archivedAt) : h.archived ? created(h) : null })),
    checks, m, today),
```

An archived habit without `archivedAt` (archived before this migration) uses `createdOn` as its archive day, which excludes it everywhere. That's the old behaviour.

- [ ] **Step 4: Wins, briefing and agent**

- **`functions/lib/services/wins.ts`:**
  - Each habit win gets `possible`:
    - daily: days in the week up to today and on/after `createdDay(h.createdAt)`
    - weekly: `1`
  - When `opts.extras.includes("energy")`, compute `insight`:
    - `listEnergy(db, userId, addDays(today, -59), today)`
    - daily habits' checks over the same window (one query on `habitChecks` with `between(period, from, today)`)
    - `energyInsight(...)`, then `insightText` or null
  - Otherwise `insight: null`.
- **`functions/lib/services/briefing.ts`:**
  - Pass `ctx.extras.includes("energy")` as the 6th `getDay` arg.
  - Habit mapping adds `timeOfDay: h.timeOfDay`.
  - `timeOfDay: ctx.extras.includes("time_of_day")`.
  - `energyAsk: kind === "evening" && ctx.extras.includes("energy") && planner && day?.energy === null`.
  - `insight: kind === "weekly" ? (w?.insight ?? null) : null`; keep the wins result in a variable `w` for this.
  - Wins habits map `possible`.
- **`functions/lib/services/planner-agent.ts`:**

```ts
export async function agentEnergy(db: Db, userId: string, input: { level: EnergyLevel; date?: string }, now = new Date()) {
  const today = berlinToday(now);
  const day = input.date ?? today;
  await setEnergy(db, userId, day, input.level, today);
  return { speech: `Logged energy: ${input.level} for ${day === today ? "today" : day}.` };
}
```

- [ ] **Step 5: Routes and gates**

- **`functions/lib/routes/planner.ts`:**
  - `/day` passes `c.var.extras.includes("energy")` as the 6th arg.
  - Add:
    - `.put("/habits/order", validate("json", habitOrderSchema), …)` returning `{ habits }`. Register it **before** `.patch("/habits/:id"…)`; method + path differ, so order matters only for the same method.
    - `.put("/energy/:date", validate("json", energyPutSchema), …)` → `setEnergy(db, userId, pathDate(date), level)` returns `{ day, level }`.
    - `.delete("/energy/:date", …)` → `setEnergy(…, null)`.
- **`functions/lib/routes/agent.ts`:** `.post("/planner/energy", validate("json", agentEnergySchema), …)` → `agentEnergy`.
- **`functions/lib/app.ts`:** `for (const path of ["/planner/energy/*", "/agent/planner/energy"]) app.use(path, requireExtra("energy"));`

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm test` (and the isolation script, if the server is allowed). Expected: GREEN.

Commit: `Planner: tiny/time-of-day fields, reliable reorder, archive dates, energy check-in API`.

---

### Task 4: Export/import (wants, energy, habit fields, period keys) and money cleanup

**Files:**
- `shared/money-schemas.ts`, `shared/schemas.ts`, `shared/schemas.test.ts`
- `functions/lib/services/transfer.ts`
- `functions/lib/services/money/wants.ts`, `functions/lib/services/money/crud.ts`, `functions/lib/services/money/agent.ts`
- `scripts/isolation-check.mjs`

- [ ] **Step 1: Schema tests (RED)**

Append to `shared/schemas.test.ts`:

```ts
describe("export v3 additions", () => {
  const want = { id: "w1", name: "Lamp", priceCents: 3990, url: null, createdAt: "2026-10-01T08:00:00.000Z", readyAt: "2026-10-02T08:00:00.000Z", status: "skipped", decidedAt: "2026-10-02T09:00:00.000Z", expenseId: null };
  it("accepts wants and energy", () => {
    const r = exportSchema.safeParse({
      version: 3,
      ...base,
      money: { ...money, wants: [want] },
      planner: { habits: [habit], habitChecks: [], dayTasks: [], energy: [{ day: "2026-10-05", level: "high", updatedAt: "2026-10-05T20:00:00.000Z" }] },
    });
    expect(r.success).toBe(true);
  });
  it("rejects a want pointing at an unknown expense", () => {
    const r = exportSchema.safeParse({ version: 3, ...base, money: { ...money, wants: [{ ...want, expenseId: "nope" }] }, planner: { habits: [], habitChecks: [], dayTasks: [] } });
    expect(r.success).toBe(false);
  });
  it("rejects a weekly check that isn't on a Monday", () => {
    const r = exportSchema.safeParse({
      version: 3,
      ...base,
      money,
      planner: { habits: [habit], habitChecks: [{ habitId: "h1", period: "2026-10-06", createdAt: "2026-10-06T08:00:00.000Z" }], dayTasks: [] },
    });
    expect(r.success).toBe(false);
  });
});
```

RED: the wants and energy keys are stripped or ignored, the unknown expense isn't detected, and the Tuesday weekly check isn't detected.

- [ ] **Step 2: Schemas (GREEN)**

In `shared/money-schemas.ts`, add a `wantRowSchema` (fields as `WantRow`; `status` an enum; `url` nullable; ISO strings via `z.iso.datetime({ offset: true })`), and add `wants: z.array(wantRowSchema).optional()` to `moneyExportSchema`.

In `shared/schemas.ts`:
- `checkMoneyReferences`:
  - duplicate want ids
  - every `want.expenseId` must be null or an expense id in the file
- `checkPlannerReferences`:
  - build `frequencyById` from habits
  - for each check: `if (f && !isValidPeriod(f, c.period)) issue([...], \`Check on ${c.period} isn't a valid ${f} period\`)`
  - import `isValidPeriod` from `./planner`
  - duplicate energy days give an issue

- [ ] **Step 3: Transfer**

`functions/lib/services/transfer.ts`:

**Export:**
- Also select `wants` and `energyCheckins` by user.
- `money.wants: strip(wantRows)`
- `planner.energy: strip(energyRows)`

**Import, version 3:**
- If `m.wants !== undefined`:
  - delete the user's wants **before** expenses, because of the FK
  - insert with `id: id(r.id)`, `expenseId: r.expenseId ? id(r.expenseId) : null`, `userId`
- If `p.energy !== undefined`:
  - delete the user's energy
  - insert with `userId`
- Habits: insert with the defaults `tiny: r.tiny ?? null`, `timeOfDay: r.timeOfDay ?? "any"`, `archivedAt: r.archivedAt ?? null`.
- Summary adds `wants: m.wants?.length ?? 0` when v3.

Note: the money delete order must put `db.delete(wants)` before `db.delete(expenses)`.

- [ ] **Step 4: Money cleanup**

- **`wants.ts` `buyWant`:** narrow the `try` to only `createExpense`, then do the link outside:

```ts
  let expense;
  try {
    expense = await createExpense(db, userId, { … });
  } catch (err) {
    await db.update(wants).set({ status: "waiting", decidedAt: null }).where(where(userId, id));
    throw err;
  }
  await db.update(wants).set({ expenseId: expense.id }).where(where(userId, id));
  return { want: { ...strip(claimed), expenseId: expense.id }, expenseId: expense.id };
```

- **`crud.ts` `createCategory`:** wrap the insert. On a unique-constraint error (`/UNIQUE constraint failed/i.test(String(err))`), throw `new ApiError(409, "name_taken", \`A category named "${input.name}" already exists\`)`.
- **`agent.ts` `resolveCategory`:** around `createCategory(db, userId, { name: OTHER_CATEGORY_NAME })`, catch `ApiError` with code `name_taken` and return the now-existing Other, by re-listing and finding it with `findCategoryByName`.

**Isolation checks** (after the want-list block):

```js
// ---- Other created on demand; archived categories aren't matched
const bobCats2 = (await bob("GET", "/money/categories")).body.categories;
const bobOther2 = bobCats2.find((c) => c.name === "Other");
await bob("PATCH", `/money/categories/${bobOther2.id}`, { name: `Misc ${run}` });
const newOther = await agent("POST", "/agent/money/expenses", { category: "Other", amount: 1 });
check("Other is created when none exists", newOther.status === 201 && newOther.body?.expense?.category === "Other", JSON.stringify(newOther.body));
await agent("DELETE", `/agent/money/expenses/${newOther.body?.expense?.id}`);
const funCat = bobCats2.find((c) => c.name === "Fun");
await bob("PATCH", `/money/categories/${funCat.id}`, { archived: true });
check("archived non-Other category isn't matched (404)", (await agent("POST", "/agent/money/expenses", { category: "fun", amount: 1 })).status === 404);
await bob("PATCH", `/money/categories/${funCat.id}`, { archived: false });
check("duplicate category name in other case (409)", (await bob("POST", "/money/categories", { name: "FUN" })).status === 409);
```

After the existing `version 3 import restores planner` checks, add:

```js
check("export v3 carries wants and energy", Array.isArray(bobExport3.money?.wants) && Array.isArray(bobExport3.planner?.energy), JSON.stringify(Object.keys(bobExport3.money ?? {})));
```

`bobExport3` is taken after the want and energy blocks, so it contains them. If not, move its line after them and ledger the move.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test` (and isolation, if allowed).

Commit: `Backups include wants and energy; period keys validated; buy rollback narrowed; unique category names`.

---

### Task 5: Planner UI (tiny, time of day, energy chips, insight, loading, reorder, toggle queue)

**Files:**
- `src/lib/planner-api.ts`, `src/hooks/planner.ts`
- `src/components/planner/today-card.tsx`, `src/components/planner/home-today.tsx`, `src/components/planner/manage-habits.tsx`, `src/components/planner/month-section.tsx`, `src/components/planner/wins-card.tsx`
- Create: `src/components/planner/energy-chips.tsx`

- [ ] **Step 1: API and hooks**

`plannerApi`:
- `createHabit` takes `HabitCreateInput`
- `reorder: (ids: string[]) => request<{ habits: HabitRow[] }>("/planner/habits/order", { method: "PUT", body: json({ ids }) })`
- `setEnergy: (date: string, level: EnergyLevel | null) => level ? request(\`/planner/energy/${date}\`, { method: "PUT", body: json({ level }) }) : request(\`/planner/energy/${date}\`, { method: "DELETE" })`

`useToggleCheck`: TanStack's `scope` must be static per hook instance, so queue per box in `mutationFn` instead:

```ts
const pending = new Map<string, Promise<unknown>>();
/** Runs `fn` after the previous call with the same key finishes, so fast clicks on one box land in order. */
function queued<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  pending.set(key, run);
  void run.finally(() => pending.get(key) === run && pending.delete(key));
  return run;
}
```

Use `mutationFn: (v) => queued(\`${v.habitId}|${periodFor(v.frequency, v.date)}\`, () => (v.checked ? plannerApi.tick(...) : plannerApi.untick(...)))`. Keep the optimistic logic.

Add:

```ts
export function useSetEnergy() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: "planner-energy" },
    mutationFn: ({ date, level }: { date: string; level: EnergyLevel | null }) => plannerApi.setEnergy(date, level),
    onMutate: ({ date, level }) => qc.setQueryData<DayView>(plannerKeys.day(date), (d) => (d ? { ...d, energy: level } : d)),
    onError: (err) => toast.error(err.message),
    onSettled: () => qc.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
```

- [ ] **Step 2: `energy-chips.tsx`**

```tsx
import type { EnergyLevel } from "@shared/energy";
import { useSetEnergy } from "@/hooks/planner";
import { cn } from "@/lib/utils";

const LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "low" },
  { value: "ok", label: "ok" },
  { value: "high", label: "high" },
];

/** One tap a day. Tapping the chosen level again clears it. */
export function EnergyChips({ date, level }: { date: string; level: EnergyLevel | null }) {
  const set = useSetEnergy();
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Energy today">
      <span className="text-xs text-muted-foreground">Energy</span>
      {LEVELS.map((l) => {
        const on = level === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set.mutate({ date, level: on ? null : l.value })}
            className={cn(
              "h-7 rounded-full px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              on ? "bg-primary text-primary-foreground" : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Today card and Home**

In `today-card.tsx`:
- `const extras = { tiny: useHasExtra("tiny_habits"), time: useHasExtra("time_of_day"), energy: useHasExtra("energy") };`
- **Header:** when `extras.energy && d`, render `<EnergyChips date={d.date} level={d.energy} />` under the title row (full width on mobile).
- **Loading state:** the content wrapper class adds `day.isPlaceholderData && "pointer-events-none opacity-60"` and `aria-busy={day.isPlaceholderData}`.
- **`HabitChecklist`:**
  - gains `showTiny?: boolean`; under the name row, when `showTiny && h.tiny`, render `<p className="pl-7 text-xs text-muted-foreground">Tiny: {h.tiny}</p>`
  - gains `groupByTime?: boolean`; when true, and only for daily habits, render sub-groups in the order Morning, Afternoon, Evening, Anytime, each with a small heading `<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Morning</p>`, skipping empty groups
- Pass `showTiny={extras.tiny}` everywhere, and `groupByTime={extras.time}` for the daily list.

In `home-today.tsx`: the same energy chips (when the extra is on) and the same `showTiny`/`groupByTime` props.

- [ ] **Step 4: Manage habits**

In `HabitEditor`, when the extras are on:
- **Time of day:** a `<select>` with Morning / Afternoon / Evening / Anytime (`aria-label="When"`), calling `updateHabit(id, { timeOfDay })`.
- **Tiny version:** an input under the name (`placeholder="Tiny version, e.g. 1 page"`, max 80), saved on blur via `updateHabit(id, { tiny })`.

The new-habit form sends `timeOfDay` when the extra is on (default `any`).

Reorder:

```ts
  const move = usePlannerAction((ids: string[]) => plannerApi.reorder(ids));
  // in HabitEditor: pass `onMove(dir)` from the parent, which swaps two entries in the active ids array and calls move.mutate(newIds)
```

Replace the `swap` logic with this.

- [ ] **Step 5: Month section and Wins**

- `month-section.tsx`: the inner content wrapper adds `q.isPlaceholderData && "pointer-events-none"` and `aria-busy`.
- `wins-card.tsx`:
  - The empty text is `week === thisWeek ? "Nothing yet this week. Tick one thing and it shows up here." : "Nothing logged that week."`.
  - Render `w.insight` (when not null) as a final line: `<p className="text-sm text-muted-foreground">{w.insight}</p>`.
  - Habit wins show `×count` unchanged.

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm test && npm run build`.

Commit: `Planner UI: tiny versions, time-of-day groups, energy chips and insight, no clicks while loading, reliable reorder`.

---

### Task 6: Money and People UI cleanup

**Files:** `src/components/money/want-list.tsx`, `src/routes/people.tsx`

- [ ] **Step 1: Undo for Skip and remove**

In `WantList`:
- Keep `const [hidden, setHidden] = useState<Set<string>>(new Set())`.
- Filter `w.waiting` by `!hidden.has(item.id)`.
- Replace the direct `skip.mutate` / `remove.mutate` with:

```ts
  function later(item: WantRow, action: "skip" | "remove") {
    setHidden((s) => new Set(s).add(item.id));
    const timer = setTimeout(() => (action === "skip" ? skip.mutate(item.id) : remove.mutate(item.id)), 5000);
    toast(action === "skip" ? `Skipped ${item.name}` : `Removed ${item.name}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          setHidden((s) => {
            const n = new Set(s);
            n.delete(item.id);
            return n;
          });
        },
      },
    });
  }
```

- Change the skip action's success message to `undefined`, since the toast already said it.
- Buttons get `aria-label={\`Skip ${item.name}\`}`, `aria-label={\`Buy ${item.name}\`}` and `aria-label={\`Remove ${item.name}\`}`.
- Import `toast` from `sonner`.

- [ ] **Step 2: Buy dialog default after load**

In `BuyDialog`, change the effect deps to `[want?.id, active.length]`. Only set the category when `categoryId` is empty or not in `active`.

- [ ] **Step 3: People toggles in order**

In `src/routes/people.tsx`, add `scope: { id: "people-access" }` to the `useMutation` options.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run build`.

Commit: `Want list undo and labels, buy default after load, People toggles in order`.

---

### Task 7: Hermes (energy command, cron parsing, quoting) and docs

**Files:**
- `integrations/hermes/life-board/cron/*.py`
- `integrations/hermes/life-board/scripts/life_board.py`
- `integrations/hermes/life-board/SKILL.md`
- `README.md`, `docs/DEPLOY.md`

- [ ] **Step 1: Cron scripts**

In all three `life_board_*.py`, replace `setting()` with:

```python
def setting(name):
    if os.environ.get(name):
        return os.environ[name]
    env = pathlib.Path(os.environ.get("HERMES_HOME", pathlib.Path.home() / ".hermes")) / ".env"
    try:
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[len("export "):]
            key, sep, value = line.partition("=")
            if not sep or key.strip() != name:
                continue
            value = value.strip()
            if value[:1] in ("'", '"'):
                return value[1:].split(value[0], 1)[0]
            return value.split(" #", 1)[0].strip()
    except OSError:
        pass
    return ""
```

Replace the request block's `except Exception` with:

```python
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(f"Life Board: token rejected ({e.code}) — create a new one in Voice assistant and update ~/.hermes/.env")
        else:
            print(f"Life Board error {e.code}")
        return
    except Exception as e:  # noqa: BLE001
        print(f"Life Board unreachable: {e}")
        return
```

Add `import urllib.error`.

Manual checks, writing a temp `.env` in the scratchpad:
- `export LIFE_BOARD_URL=http://127.0.0.1:1 # local` is read as `http://127.0.0.1:1`, giving the "unreachable" line
- a 401 from a tiny local server (Python one-liner `http.server` returning 401) gives the "token rejected" line

- [ ] **Step 2: Client and skill**

- `life_board.py`: add `energy` with `level` choices `low|ok|high` and `--date`, calling `POST /planner/energy`. Add it to the usage docstring.
- `SKILL.md`:
  - "When to Use": "The user reports energy ('energy low', 'tired today' → low, 'great day' → high)."
  - Planner procedure: `life_board.py energy high`.
  - Pitfalls: "Wrap free text (names, notes, tasks) in **single quotes**; write an apostrophe as `'\''`. Double quotes let `$5` and backticks be read by the shell."
  - Change the Money example to single quotes: `--note 'Lidl'`.

- [ ] **Step 3: Docs**

- `README.md`:
  - Extras paragraph: add *Tiny versions*, *Time of day* and *Energy check-in*.
  - Planner routes: `PUT /api/planner/habits/order`, `PUT|DELETE /api/planner/energy/:date`, and habit `tiny`/`timeOfDay`.
  - Agent routes: `POST /api/agent/planner/energy`.
- `docs/DEPLOY.md`: one line, "Energy: Hermes' evening message asks for it when the Energy check-in extra is on."

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test && python -I integrations/hermes/life-board/scripts/life_board.py --help`.

Commit: `Hermes: energy command, sturdier cron .env parsing and token errors, single-quote guidance`.

---

### Task 8: Isolation script robustness

**Files:** `scripts/isolation-check.mjs`

- [ ] **Step 1: Guard crash-prone reads and reset the owner**

- Change these direct property reads after a request into optional chains (`?.`), so a failing request reports FAIL instead of throwing:
  - `regrant.body.user.extras`
  - `commaAmount.body.expense.id`
  - `kindRead.streak` (use `kindRead?.streak`)
  - `classicRead.streak`
  - `want.body.want.readyAt`
  - `wl.waiting`
  - `bought.body.expenseId`
  - `unknown.body.error`
  - `wins.body.skipped`
- At the very end, before the summary `console.log`, add:

```js
// Leave the stable local owner as a fresh admin would be: no extras on.
await owner("PATCH", `/admin/users/${ownerMe.id}`, { extras: [] });
```

- [ ] **Step 2: Run everything**

With the API running (if allowed): `node scripts/isolation-check.mjs`.
Expected: everything PASSes except the known legacy-projects check.

Commit: `Isolation script: no crashes on failed requests, owner extras reset at the end`.
