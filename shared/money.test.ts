import { describe, expect, it } from "vitest";
import {
  addMonths,
  barState,
  berlinMonth,
  berlinToday,
  categoryLeft,
  dueDateFor,
  eurosToCents,
  findCategoryByName,
  formatEuro,
  monthBounds,
  monthTotals,
  paceSeries,
  parseEuroToCents,
  planBillOccurrences,
  speakEuro,
  waitHours,
} from "./money";

describe("dueDateFor", () => {
  it("uses the bill day when the month has it", () => {
    expect(dueDateFor(15, "2026-10")).toBe("2026-10-15");
  });
  it("clamps to the last day of short months", () => {
    expect(dueDateFor(31, "2026-11")).toBe("2026-11-30");
    expect(dueDateFor(31, "2026-02")).toBe("2026-02-28");
    expect(dueDateFor(30, "2028-02")).toBe("2028-02-29");
    expect(dueDateFor(29, "2027-02")).toBe("2027-02-28");
  });
});

describe("month helpers", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("returns first and last day", () => {
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("Berlin calendar", () => {
  it("23:30 Berlin on the last day of the month is still that month", () => {
    // 2026-10-31T23:30 CET == 22:30Z
    const now = new Date("2026-10-31T22:30:00Z");
    expect(berlinToday(now)).toBe("2026-10-31");
    expect(berlinMonth(now)).toBe("2026-10");
  });
  it("00:30 Berlin on the 1st is already the new month even though UTC is not", () => {
    const now = new Date("2026-11-30T23:30:00Z"); // 00:30 Dec 1 Berlin
    expect(berlinToday(now)).toBe("2026-12-01");
    expect(berlinMonth(now)).toBe("2026-12");
  });
});

describe("planBillOccurrences", () => {
  const bill = { dayOfMonth: 1, startsOn: "2026-08-10", loggedThrough: null as string | null, active: true };

  it("never logs a due date before starts_on", () => {
    expect(planBillOccurrences(bill, "2026-08-20")).toEqual([]);
  });
  it("catches up across several months", () => {
    expect(planBillOccurrences(bill, "2026-10-06")).toEqual(["2026-09-01", "2026-10-01"]);
  });
  it("skips dates already logged, so deleted expenses stay deleted", () => {
    expect(planBillOccurrences({ ...bill, loggedThrough: "2026-09-01" }, "2026-10-06")).toEqual(["2026-10-01"]);
    expect(planBillOccurrences({ ...bill, loggedThrough: "2026-10-01" }, "2026-10-06")).toEqual([]);
  });
  it("does not log a due date later than today", () => {
    expect(planBillOccurrences({ ...bill, dayOfMonth: 15, startsOn: "2026-10-01" }, "2026-10-14")).toEqual([]);
    expect(planBillOccurrences({ ...bill, dayOfMonth: 15, startsOn: "2026-10-01" }, "2026-10-15")).toEqual(["2026-10-15"]);
  });
  it("logs the starts_on day itself when it is a due date", () => {
    expect(planBillOccurrences({ ...bill, startsOn: "2026-10-01" }, "2026-10-01")).toEqual(["2026-10-01"]);
  });
  it("clamps the 31st in short months", () => {
    expect(planBillOccurrences({ ...bill, dayOfMonth: 31, startsOn: "2027-01-01" }, "2027-03-05")).toEqual([
      "2027-01-31",
      "2027-02-28",
    ]);
  });
  it("logs nothing for inactive bills", () => {
    expect(planBillOccurrences({ ...bill, active: false }, "2026-10-06")).toEqual([]);
  });
});

describe("categoryLeft and barState", () => {
  it("subtracts spent and upcoming bills from the limit", () => {
    expect(categoryLeft({ limitCents: 30000, spentCents: 21200, upcomingCents: 0 })).toBe(8800);
    expect(categoryLeft({ limitCents: 5000, spentCents: 0, upcomingCents: 3000 })).toBe(2000);
  });
  it("returns null without a limit", () => {
    expect(categoryLeft({ limitCents: null, spentCents: 100, upcomingCents: 0 })).toBeNull();
  });
  it("is ok below 80%, warn from 80%, over above the limit", () => {
    expect(barState(10000, 7999)).toBe("ok");
    expect(barState(10000, 8000)).toBe("warn");
    expect(barState(10000, 10000)).toBe("warn");
    expect(barState(10000, 10001)).toBe("over");
    expect(barState(null, 500)).toBe("none");
  });
});

describe("monthTotals", () => {
  it("income minus expenses, net savings and debt payments", () => {
    expect(
      monthTotals({ incomeCents: 250000, expenseCents: 120000, savedCents: 20000, debtPaidCents: 10000 }).leftCents,
    ).toBe(100000);
  });
  it("money taken out of savings increases what is left", () => {
    expect(monthTotals({ incomeCents: 0, expenseCents: 1000, savedCents: -5000, debtPaidCents: 0 }).leftCents).toBe(4000);
  });
});

describe("parseEuroToCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12,50", 1250],
    ["€ 7,99", 799],
    ["0.05", 5],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.000", 100000],
    ["1 000", 100000],
  ])("%s -> %i", (input, cents) => {
    expect(parseEuroToCents(input)).toBe(cents);
  });
  it.each(["", "abc", "0", "-5", "12.345.6", "1,2,3"])("rejects %s", (input) => {
    expect(parseEuroToCents(input)).toBeNull();
  });
});

describe("formatEuro", () => {
  it("formats cents as euros", () => {
    expect(formatEuro(21200)).toBe("€212.00");
    expect(formatEuro(-550)).toBe("-€5.50");
    expect(formatEuro(123456)).toBe("€1,234.56");
  });
});

describe("paceSeries", () => {
  it("accumulates spending per day and stops at today", () => {
    const series = paceSeries({
      month: "2026-02",
      today: "2026-02-03",
      dailyCents: { "2026-02-01": 1000, "2026-02-03": 500 },
      budgetCents: 28000,
    });
    expect(series).toHaveLength(28);
    expect(series[0]).toEqual({ day: 1, spentCents: 1000, budgetCents: 1000 });
    expect(series[1].spentCents).toBe(1000);
    expect(series[2].spentCents).toBe(1500);
    expect(series[3].spentCents).toBeNull();
    expect(series[27].budgetCents).toBe(28000);
  });
  it("leaves the budget line empty without limits and fills past months fully", () => {
    const series = paceSeries({ month: "2026-01", today: "2026-02-10", dailyCents: {}, budgetCents: null });
    expect(series[30]).toEqual({ day: 31, spentCents: 0, budgetCents: null });
  });
});

describe("eurosToCents", () => {
  it("converts euros with up to 2 decimals exactly", () => {
    expect(eurosToCents(50)).toBe(5000);
    expect(eurosToCents(12.4)).toBe(1240);
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents(0.01)).toBe(1);
    expect(eurosToCents(100000)).toBe(10_000_000);
  });
  it("rejects zero, negatives, over the max and sub-cent amounts", () => {
    expect(eurosToCents(0)).toBeNull();
    expect(eurosToCents(-5)).toBeNull();
    expect(eurosToCents(100000.01)).toBeNull();
    expect(eurosToCents(12.345)).toBeNull();
    expect(eurosToCents(Number.NaN)).toBeNull();
    expect(eurosToCents(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("findCategoryByName", () => {
  const cats = [
    { id: "a", name: "Food" },
    { id: "b", name: "Eating  Out" },
    { id: "c", name: "food" },
  ];
  it("ignores case and extra spaces, first match wins", () => {
    expect(findCategoryByName(cats, "FOOD")?.id).toBe("a");
    expect(findCategoryByName(cats, "  eating out ")?.id).toBe("b");
  });
  it("returns undefined when nothing matches", () => {
    expect(findCategoryByName(cats, "Gifts")).toBeUndefined();
    expect(findCategoryByName([], "Food")).toBeUndefined();
  });
});

describe("waitHours", () => {
  it("waits longer for pricier things", () => {
    expect(waitHours(1)).toBe(24);
    expect(waitHours(4999)).toBe(24);
    expect(waitHours(5000)).toBe(72);
    expect(waitHours(20000)).toBe(72);
    expect(waitHours(20001)).toBe(168);
  });
});

describe("speakEuro", () => {
  it("never says 0 euros for a non-zero amount", () => {
    expect(speakEuro(50)).toBe("less than 1 euro");
    expect(speakEuro(-50)).toBe("less than 1 euro");
    expect(speakEuro(0)).toBe("0 euros");
    expect(speakEuro(100)).toBe("1 euro");
    expect(speakEuro(41250)).toBe("412 euros");
  });
});
