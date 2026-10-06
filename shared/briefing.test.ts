import { describe, expect, it } from "vitest";
import { eveningMessage, morningMessage, weeklyMessage, type BriefingInput } from "./briefing";

const base: BriefingInput = {
  today: "2026-10-06",
  tomorrow: "2026-10-07",
  tasks: [],
  daily: [],
  weekly: [],
  monthly: [],
  bills: null,
  readyWants: null,
  wins: null,
  leftCents: null,
  savedCents: null,
};

describe("morningMessage", () => {
  it("lists every part", () => {
    const m = morningMessage({
      ...base,
      daily: [
        { name: "Read", checked: false, streak: 3, atRisk: false, frequency: "daily" },
        { name: "Water", checked: true, streak: 1, atRisk: false, frequency: "daily" },
      ],
      weekly: [{ name: "Gym", checked: false, streak: 0, atRisk: false, frequency: "weekly" }],
      bills: [
        { name: "Rent", amountCents: 90000, dueOn: "2026-10-07" },
        { name: "Phone", amountCents: 2000, dueOn: "2026-10-06" },
      ],
      readyWants: [{ name: "AirPods", priceCents: 20000 }],
    });
    expect(m).toBe(
      [
        'Good morning. Top 3: not set yet — reply "top 3: …".',
        "Habits today: Read. This week: Gym.",
        "Bills: Phone €20.00 due today, Rent €900.00 due tomorrow.",
        "Ready to decide: AirPods (€200.00).",
      ].join("\n"),
    );
  });
  it("shows a set top 3", () => {
    expect(morningMessage({ ...base, tasks: [{ text: "Call bank", done: false }, { text: "Report", done: true }] })).toBe(
      "Good morning. Top 3: Call bank, Report (done).",
    );
  });
  it("says so when there's nothing at all (planner off)", () => {
    expect(morningMessage({ ...base, tasks: null })).toBe("Good morning. Nothing scheduled, enjoy the day.");
  });
});

describe("eveningMessage", () => {
  it("is silent when everything is done", () => {
    expect(
      eveningMessage({
        ...base,
        tasks: [{ text: "A", done: true }],
        daily: [{ name: "Read", checked: true, streak: 4, atRisk: false, frequency: "daily" }],
      }),
    ).toBe("");
  });
  it("lists what's left and at-risk streaks", () => {
    expect(
      eveningMessage({
        ...base,
        tasks: [{ text: "Report", done: false }],
        daily: [
          { name: "Read", checked: false, streak: 12, atRisk: true, frequency: "daily" },
          { name: "Water", checked: false, streak: 0, atRisk: false, frequency: "daily" },
        ],
        weekly: [{ name: "Gym", checked: false, streak: 3, atRisk: true, frequency: "weekly" }],
      }),
    ).toBe(
      [
        "Evening check.",
        "Top 3 still open: Report.",
        "Habits left: Read, Water.",
        "Read missed yesterday, tick today to keep 12.",
        "Gym missed last week, tick this week to keep 3.",
      ].join("\n"),
    );
  });
  it("is silent with the planner off", () => {
    expect(eveningMessage({ ...base, tasks: null })).toBe("");
  });
});

describe("weeklyMessage", () => {
  it("summarises the week and money", () => {
    expect(
      weeklyMessage({
        ...base,
        wins: {
          total: 23,
          tasksDone: 9,
          habits: [
            { name: "Read", count: 6, frequency: "daily" },
            { name: "Gym", count: 1, frequency: "weekly" },
          ],
          shipped: ["Garden Planner"],
          noSpendDays: 3,
          dailyPercent: 74,
        },
        leftCents: 41200,
        savedCents: 20000,
      }),
    ).toBe(
      [
        "Week in review: 23 wins. Top 3 done 9×, Read 6/7, Gym ✓, shipped Garden Planner, 3 no-spend days.",
        "Daily habits: 74% of the week.",
        "Money: €412.00 left this month. Saved by waiting: €200.00.",
      ].join("\n"),
    );
  });
  it("has a gentle line for a quiet week", () => {
    expect(weeklyMessage({ ...base, wins: { total: 0, tasksDone: 0, habits: [], shipped: [], noSpendDays: 0, dailyPercent: null } })).toBe(
      "Week in review: a quiet week. New week, fresh start.",
    );
  });
});
