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
