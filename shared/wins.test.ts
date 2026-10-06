import { describe, expect, it } from "vitest";
import { noSpendDays, weekDays, weekHabitPercent, winsTotal } from "./wins";

describe("weekDays", () => {
  it("lists Monday to Sunday", () => {
    expect(weekDays("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });
});

describe("noSpendDays", () => {
  const days = weekDays("2026-10-05");
  it("counts past days without spending, not the future", () => {
    expect(noSpendDays(days, new Set(["2026-10-06"]), "2026-10-07", "2026-01-01")).toEqual(["2026-10-05", "2026-10-07"]);
  });
  it("starts at the first expense ever", () => {
    expect(noSpendDays(days, new Set(), "2026-10-11", "2026-10-09")).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
  });
  it("gives nothing to someone who never logged an expense", () => {
    expect(noSpendDays(days, new Set(), "2026-10-11", null)).toEqual([]);
  });
});

describe("weekHabitPercent", () => {
  it("averages daily ticks over elapsed days since each habit existed", () => {
    const habits = [
      { createdOn: "2026-01-01", checks: new Set(["2026-10-05", "2026-10-06"]) },
      { createdOn: "2026-10-06", checks: new Set(["2026-10-06"]) },
    ];
    // today the 6th: habit A 2/2, habit B 1/1 → 3/3
    expect(weekHabitPercent(habits, weekDays("2026-10-05"), "2026-10-06")).toBe(100);
    // today the 7th: A 2/3, B 1/2 → 3/5 = 60
    expect(weekHabitPercent(habits, weekDays("2026-10-05"), "2026-10-07")).toBe(60);
  });
  it("is null with no habits", () => {
    expect(weekHabitPercent([], weekDays("2026-10-05"), "2026-10-07")).toBeNull();
  });
});

describe("winsTotal", () => {
  it("adds every kind of win", () => {
    expect(
      winsTotal({
        tasksDone: [{}, {}],
        habits: [{ count: 3 }, { count: 1 }],
        shipped: [{}],
        noSpendDays: ["a", "b"],
        skipped: [{}],
      }),
    ).toBe(10);
  });
});
