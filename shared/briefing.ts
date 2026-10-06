// Text for Hermes nudges. Pure: the server gathers the data, these functions only write.
// An empty string means "stay silent".

import { formatEuro } from "./money";
import type { Frequency, TimeOfDay } from "./planner";

type Habit = { name: string; checked: boolean; streak: number; atRisk: boolean; frequency: Frequency; timeOfDay: TimeOfDay };

export type BriefingInput = {
  today: string;
  tomorrow: string;
  /** null when Planner is off */
  tasks: { text: string; done: boolean }[] | null;
  daily: Habit[];
  weekly: Habit[];
  monthly: Habit[];
  /** null when Money is off; upcoming (unlogged) bills due today or tomorrow */
  bills: { name: string; amountCents: number; dueOn: string }[] | null;
  /** null when the Want list is off */
  readyWants: { name: string; priceCents: number }[] | null;
  /** null when Planner is off */
  wins: {
    total: number;
    tasksDone: number;
    habits: { name: string; count: number; possible: number; frequency: Frequency }[];
    shipped: string[];
    noSpendDays: number;
    dailyPercent: number | null;
  } | null;
  leftCents: number | null;
  savedCents: number | null;
  /** Time-of-day extra on: group the morning brief by morning / later. */
  timeOfDay: boolean;
  /** Energy extra on and nothing logged today: the evening message asks for it. */
  energyAsk: boolean;
  /** Energy pattern line for the weekly review, if there is one. */
  insight: string | null;
};

const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(", ");

export function morningMessage(i: BriefingInput): string {
  const lines: string[] = [];
  if (i.tasks) {
    lines.push(
      i.tasks.length === 0
        ? 'Top 3: not set yet — reply "top 3: …".'
        : `Top 3: ${i.tasks.map((t) => (t.done ? `${t.text} (done)` : t.text)).join(", ")}.`,
    );
  }
  const openDaily = i.daily.filter((h) => !h.checked);
  const dailyGroups: [Habit[], string][] = i.timeOfDay
    ? [
        [openDaily.filter((h) => h.timeOfDay === "morning"), "Morning habits"],
        [openDaily.filter((h) => h.timeOfDay !== "morning"), "Later"],
      ]
    : [[openDaily, "Habits today"]];
  const habitParts = [
    ...dailyGroups,
    [i.weekly.filter((h) => !h.checked), "This week"] as [Habit[], string],
    [i.monthly.filter((h) => !h.checked), "This month"] as [Habit[], string],
  ]
    .filter(([open]) => open.length > 0)
    .map(([open, label]) => `${label}: ${names(open)}.`);
  if (habitParts.length > 0) lines.push(habitParts.join(" "));
  if (i.bills && i.bills.length > 0) {
    const sorted = [...i.bills].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    lines.push(`Bills: ${sorted.map((b) => `${b.name} ${formatEuro(b.amountCents)} due ${b.dueOn === i.today ? "today" : "tomorrow"}`).join(", ")}.`);
  }
  if (i.readyWants && i.readyWants.length > 0) {
    lines.push(`Ready to decide: ${i.readyWants.map((w) => `${w.name} (${formatEuro(w.priceCents)})`).join(", ")}.`);
  }
  if (lines.length === 0) return "Good morning. Nothing scheduled, enjoy the day.";
  return [`Good morning. ${lines[0]}`, ...lines.slice(1)].join("\n");
}

export function eveningMessage(i: BriefingInput): string {
  if (!i.tasks && !i.energyAsk) return "";
  const lines: string[] = [];
  const open = (i.tasks ?? []).filter((t) => !t.done);
  if (open.length > 0) lines.push(`Top 3 still open: ${open.map((t) => t.text).join(", ")}.`);
  const left = i.daily.filter((h) => !h.checked);
  if (left.length > 0) lines.push(`Habits left: ${names(left)}.`);
  for (const h of [...i.daily, ...i.weekly]) {
    if (!h.atRisk || h.checked) continue;
    lines.push(
      h.frequency === "weekly"
        ? `${h.name} missed last week, tick this week to keep ${h.streak}.`
        : `${h.name} missed yesterday, tick today to keep ${h.streak}.`,
    );
  }
  if (i.energyAsk) lines.push('Energy today? Reply "energy low", "ok" or "high".');
  return lines.length === 0 ? "" : ["Evening check.", ...lines].join("\n");
}

export function weeklyMessage(i: BriefingInput): string {
  const lines: string[] = [];
  const w = i.wins;
  if (w) {
    if (w.total === 0) {
      lines.push("Week in review: a quiet week. New week, fresh start.");
    } else {
      const parts: string[] = [];
      if (w.tasksDone > 0) parts.push(`Top 3 done ${w.tasksDone}×`);
      for (const h of w.habits.slice(0, 3)) parts.push(h.frequency === "weekly" ? `${h.name} ✓` : `${h.name} ${h.count}/${h.possible}`);
      if (w.shipped.length > 0) parts.push(`shipped ${w.shipped.join(", ")}`);
      if (w.noSpendDays > 0) parts.push(`${w.noSpendDays} no-spend day${w.noSpendDays === 1 ? "" : "s"}`);
      lines.push(`Week in review: ${w.total} win${w.total === 1 ? "" : "s"}. ${parts.join(", ")}.`);
      if (w.dailyPercent !== null) lines.push(`Daily habits: ${w.dailyPercent}% of the week.`);
      if (i.insight) lines.push(i.insight);
    }
  }
  const money: string[] = [];
  if (i.leftCents !== null) {
    money.push(i.leftCents >= 0 ? `${formatEuro(i.leftCents)} left this month.` : `${formatEuro(-i.leftCents)} over this month.`);
  }
  if (i.savedCents !== null && i.savedCents > 0) money.push(`Saved by waiting: ${formatEuro(i.savedCents)}.`);
  if (money.length > 0) lines.push(`Money: ${money.join(" ")}`);
  return lines.join("\n");
}
