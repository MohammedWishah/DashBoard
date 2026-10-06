import { describe, expect, it } from "vitest";
import {
  goalMonthlyNeed,
  loggedThroughAfterDayChange,
  matchNotes,
  monthReview,
  monthsInclusive,
  noteSuggestions,
  pickQuickPicks,
  type ExpenseHabitRow,
} from "./money";

describe("goalMonthlyNeed", () => {
  const goal = { savedCents: 20000, targetCents: 80000, targetDate: "2026-12-20" };
  it("splits what's left over the months to the date, this month included", () => {
    expect(monthsInclusive("2026-10", "2026-12")).toBe(3);
    expect(goalMonthlyNeed(goal, "2026-10-06")).toBe(20000);
  });
  it("rounds up to the cent", () => {
    expect(goalMonthlyNeed({ ...goal, targetCents: 20001 + 20000 }, "2026-10-06")).toBe(6667);
  });
  it("needs everything this month when the date is this month", () => {
    expect(goalMonthlyNeed({ ...goal, targetDate: "2026-10-31" }, "2026-10-06")).toBe(60000);
  });
  it("is null without a date, once reached, or after the date", () => {
    expect(goalMonthlyNeed({ ...goal, targetDate: null }, "2026-10-06")).toBeNull();
    expect(goalMonthlyNeed({ ...goal, savedCents: 80000 }, "2026-10-06")).toBeNull();
    expect(goalMonthlyNeed(goal, "2027-01-02")).toBeNull();
  });
});

describe("loggedThroughAfterDayChange", () => {
  it("marks the rest of this month logged when this month's bill already logged", () => {
    expect(loggedThroughAfterDayChange("2026-10-01", "2026-10-06")).toBe("2026-10-31");
  });
  it("leaves it alone when this month hasn't logged yet", () => {
    expect(loggedThroughAfterDayChange("2026-09-20", "2026-10-06")).toBe("2026-09-20");
    expect(loggedThroughAfterDayChange(null, "2026-10-06")).toBeNull();
  });
});

const row = (r: Partial<ExpenseHabitRow>): ExpenseHabitRow => ({
  categoryId: "food",
  note: null,
  amountCents: 100,
  count: 1,
  lastOn: "2026-10-01",
  ...r,
});

describe("pickQuickPicks", () => {
  it("keeps repeats of 3+, most frequent first, at most 3", () => {
    const picks = pickQuickPicks([
      row({ note: "Coffee", amountCents: 320, count: 9 }),
      row({ note: "Bus", amountCents: 290, count: 3, categoryId: "transport" }),
      row({ note: "Lunch", amountCents: 850, count: 2 }),
      row({ note: "Lidl", amountCents: 2500, count: 4 }),
      row({ note: null, amountCents: 1000, count: 3, lastOn: "2026-10-05" }),
    ]);
    expect(picks.map((p) => p.note)).toEqual(["Coffee", "Lidl", null]);
  });
});

describe("noteSuggestions and matchNotes", () => {
  const s = noteSuggestions([
    row({ note: "Lidl", count: 5 }),
    row({ note: "lidl ", count: 2, categoryId: "other" }),
    row({ note: "Coffee", count: 7 }),
    row({ note: "Cinema", count: 1, categoryId: "fun" }),
    row({ note: "  ", count: 9 }),
  ]);
  it("merges notes ignoring case and picks the most used category", () => {
    expect(s).toEqual([
      { note: "Lidl", categoryId: "food" },
      { note: "Coffee", categoryId: "food" },
      { note: "Cinema", categoryId: "fun" },
    ]);
  });
  it("matches 2+ letters anywhere, prefix matches first, not the exact note", () => {
    expect(matchNotes(s, "c")).toEqual([]);
    expect(matchNotes(s, "ci").map((m) => m.note)).toEqual(["Cinema"]);
    expect(matchNotes(s, "dl").map((m) => m.note)).toEqual(["Lidl"]);
    expect(matchNotes(s, "lidl")).toEqual([]);
  });
});

describe("monthReview", () => {
  const base = {
    month: "2026-09",
    totals: { incomeCents: 200000, expenseCents: 120000, savedCents: 20000, debtPaidCents: 10000 },
    previousExpenseCents: 130000,
    categories: [
      { id: "rent", name: "Rent", monthlyLimitCents: null, archived: false },
      { id: "food", name: "Food", monthlyLimitCents: 30000, archived: false },
      { id: "fun", name: "Fun", monthlyLimitCents: 10000, archived: false },
      { id: "old", name: "Old", monthlyLimitCents: 5000, archived: true },
      { id: "gym", name: "Gym", monthlyLimitCents: null, archived: false },
    ],
    spentByCategory: { rent: 80000, food: 28000, fun: 12000, gym: 0 },
    previousByCategory: { rent: 80000, food: 35000 },
    biggest: { categoryId: "rent", note: null, amountCents: 80000, spentOn: "2026-09-01" },
    savedByWaitingCents: 4500,
    expenseCount: 31,
  };

  it("sums up the month against the one before", () => {
    const r = monthReview(base);
    expect(r.totals.leftCents).toBe(50000);
    expect(r.expenseDeltaCents).toBe(-10000);
    expect(r.topCategories).toEqual([
      { categoryId: "rent", name: "Rent", spentCents: 80000, previousCents: 80000 },
      { categoryId: "food", name: "Food", spentCents: 28000, previousCents: 35000 },
      { categoryId: "fun", name: "Fun", spentCents: 12000, previousCents: 0 },
    ]);
    expect(r.biggest).toEqual({ label: "Rent", categoryName: "Rent", amountCents: 80000, spentOn: "2026-09-01" });
  });
  it("counts limits kept, skipping archived categories with no spending", () => {
    expect(monthReview(base).limits).toEqual({ kept: 1, total: 2 });
  });
  it("has no comparison when the month before is empty", () => {
    expect(monthReview({ ...base, previousExpenseCents: 0 }).expenseDeltaCents).toBeNull();
  });
});
