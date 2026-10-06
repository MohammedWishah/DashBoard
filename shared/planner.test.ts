import { describe, expect, it } from "vitest";
import {
  addDays,
  createdDay,
  dayPercents,
  daysOfMonth,
  habitPercent,
  isFuturePeriod,
  isValidPeriod,
  mondayOf,
  mondaysInMonth,
  periodFor,
  periodLabel,
  streak,
  topHabits,
} from "./planner";

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // Sunday, week crosses months
    expect(mondayOf("2027-01-02")).toBe("2026-12-28"); // week crosses years
  });
  it("lists days and Mondays of a month", () => {
    expect(daysOfMonth("2028-02")).toHaveLength(29);
    expect(mondaysInMonth("2026-10")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(mondaysInMonth("2026-06")).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]);
  });
  it("turns an ISO time into its Berlin day", () => {
    expect(createdDay("2026-10-06T22:30:00.000Z")).toBe("2026-10-07");
  });
});

describe("periods", () => {
  it("maps a date to each frequency's period", () => {
    expect(periodFor("daily", "2026-10-08")).toBe("2026-10-08");
    expect(periodFor("weekly", "2026-10-08")).toBe("2026-10-05");
    expect(periodFor("monthly", "2026-10-08")).toBe("2026-10-01");
  });
  it("validates period keys", () => {
    expect(isValidPeriod("weekly", "2026-10-05")).toBe(true);
    expect(isValidPeriod("weekly", "2026-10-06")).toBe(false);
    expect(isValidPeriod("monthly", "2026-10-01")).toBe(true);
    expect(isValidPeriod("monthly", "2026-10-02")).toBe(false);
    expect(isValidPeriod("daily", "2026-10-06")).toBe(true);
  });
  it("detects future periods", () => {
    expect(isFuturePeriod("daily", "2026-10-07", "2026-10-06")).toBe(true);
    expect(isFuturePeriod("daily", "2026-10-06", "2026-10-06")).toBe(false);
    expect(isFuturePeriod("weekly", "2026-10-05", "2026-10-11")).toBe(false);
    expect(isFuturePeriod("weekly", "2026-10-12", "2026-10-11")).toBe(true);
    expect(isFuturePeriod("monthly", "2026-11-01", "2026-10-31")).toBe(true);
  });
  it("labels periods for speech", () => {
    expect(periodLabel("daily", "2026-10-06", "2026-10-06")).toBe("today");
    expect(periodLabel("daily", "2026-10-05", "2026-10-06")).toBe("2026-10-05");
    expect(periodLabel("weekly", "2026-10-05", "2026-10-06")).toBe("this week");
    expect(periodLabel("weekly", "2026-09-28", "2026-10-06")).toBe("the week of 2026-09-28");
    expect(periodLabel("monthly", "2026-10-01", "2026-10-06")).toBe("this month");
    expect(periodLabel("monthly", "2026-09-01", "2026-10-06")).toBe("2026-09");
  });
});

describe("streak", () => {
  const set = (...d: string[]) => new Set(d);
  it("counts back from today", () => {
    expect(streak("daily", set("2026-10-04", "2026-10-05", "2026-10-06"), "2026-10-06")).toBe(3);
  });
  it("starts from yesterday while today is still open", () => {
    expect(streak("daily", set("2026-10-04", "2026-10-05"), "2026-10-06")).toBe(2);
  });
  it("stops at a gap", () => {
    expect(streak("daily", set("2026-10-01", "2026-10-03", "2026-10-04"), "2026-10-04")).toBe(2);
    expect(streak("daily", set("2026-10-01"), "2026-10-06")).toBe(0);
  });
  it("counts weeks for weekly habits", () => {
    expect(streak("weekly", set("2026-09-21", "2026-09-28", "2026-10-05"), "2026-10-08")).toBe(3);
    expect(streak("weekly", set("2026-09-21", "2026-09-28"), "2026-10-08")).toBe(2);
  });
  it("is always 0 for monthly habits", () => {
    expect(streak("monthly", set("2026-10-01", "2026-09-01"), "2026-10-08")).toBe(0);
  });
});

describe("percentages", () => {
  it("counts only days since the habit was created", () => {
    const checks = new Set(["2026-10-20", "2026-10-21"]);
    // created the 20th, today the 23rd: 2 of 4 days
    expect(habitPercent("daily", "2026-10-20", checks, "2026-10", "2026-10-23")).toBe(50);
  });
  it("uses the whole month for past months", () => {
    const checks = new Set(daysOfMonth("2026-09").slice(0, 15));
    expect(habitPercent("daily", "2026-01-01", checks, "2026-09", "2026-10-06")).toBe(50);
  });
  it("is null when the month hasn't started for the habit", () => {
    expect(habitPercent("daily", "2026-11-03", new Set(), "2026-10", "2026-10-06")).toBeNull();
    expect(habitPercent("daily", "2026-01-01", new Set(), "2026-11", "2026-10-06")).toBeNull();
  });
  it("counts started weeks for weekly habits", () => {
    // October 2026 Mondays: 5, 12, 19, 26. Today the 14th: weeks of the 5th and 12th started.
    expect(habitPercent("weekly", "2026-09-01", new Set(["2026-10-05"]), "2026-10", "2026-10-14")).toBe(50);
  });
  it("gives each day's share of daily habits done", () => {
    const habits = [
      { id: "a", createdOn: "2026-09-01" },
      { id: "b", createdOn: "2026-10-02" },
    ];
    const checks = new Map([
      ["a", new Set(["2026-10-01", "2026-10-02"])],
      ["b", new Set(["2026-10-02"])],
    ]);
    const days = dayPercents(habits, checks, "2026-10", "2026-10-03");
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ date: "2026-10-01", percent: 100 }); // only "a" existed
    expect(days[1]).toEqual({ date: "2026-10-02", percent: 100 });
    expect(days[2]).toEqual({ date: "2026-10-03", percent: 0 });
    expect(days[3]).toEqual({ date: "2026-10-04", percent: null }); // future
  });
  it("gives null for days with no habits", () => {
    expect(dayPercents([], new Map(), "2026-10", "2026-10-06")[0]).toEqual({ date: "2026-10-01", percent: null });
  });
});

describe("topHabits", () => {
  it("ranks by percent, then streak, then name, and drops nulls", () => {
    const rows = [
      { name: "b", percent: 80, streak: 1 },
      { name: "a", percent: 80, streak: 1 },
      { name: "c", percent: 80, streak: 4 },
      { name: "d", percent: 95, streak: 0 },
      { name: "e", percent: null, streak: 9 },
    ];
    expect(topHabits(rows).map((r) => r.name)).toEqual(["d", "c", "a", "b"]);
    expect(topHabits(rows, 2)).toHaveLength(2);
  });
});
