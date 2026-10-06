import { describe, expect, it } from "vitest";
import { exportSchema } from "./schemas";

const base = { exportedAt: "2026-10-06T10:00:00.000Z", projects: [], shippedEvents: [], settings: [] };
const money = { categories: [], recurringBills: [], expenses: [], income: [], savingsGoals: [], savingsContributions: [], debts: [], debtPayments: [] };
const habit = { id: "h1", name: "Gym", frequency: "weekly", sortOrder: 0, archived: false, createdAt: "2026-10-01T08:00:00.000Z" };

describe("export version 3", () => {
  it("accepts planner data", () => {
    const r = exportSchema.safeParse({
      version: 3,
      ...base,
      money,
      planner: {
        habits: [habit],
        habitChecks: [{ habitId: "h1", period: "2026-10-05", createdAt: "2026-10-05T08:00:00.000Z" }],
        dayTasks: [{ id: "t1", day: "2026-10-06", position: 1, text: "Call the bank", done: false, createdAt: "2026-10-06T08:00:00.000Z" }],
      },
    });
    expect(r.success).toBe(true);
  });
  it("rejects a check for a habit not in the file", () => {
    const r = exportSchema.safeParse({
      version: 3,
      ...base,
      money,
      planner: { habits: [], habitChecks: [{ habitId: "nope", period: "2026-10-05", createdAt: "2026-10-05T08:00:00.000Z" }], dayTasks: [] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects duplicate habit names and two tasks in one slot", () => {
    const r = exportSchema.safeParse({
      version: 3,
      ...base,
      money,
      planner: {
        habits: [habit, { ...habit, id: "h2", name: "gym", frequency: "daily" }],
        habitChecks: [],
        dayTasks: [
          { id: "t1", day: "2026-10-06", position: 1, text: "a", done: false, createdAt: "2026-10-06T08:00:00.000Z" },
          { id: "t2", day: "2026-10-06", position: 1, text: "b", done: false, createdAt: "2026-10-06T08:00:00.000Z" },
        ],
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.length).toBeGreaterThanOrEqual(2);
  });
  it("still accepts version 2", () => {
    expect(exportSchema.safeParse({ version: 2, ...base, money }).success).toBe(true);
  });
});
