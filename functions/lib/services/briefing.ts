import type { Extra, Feature } from "../../../shared/features";
import { addMonths, berlinMonth, berlinToday } from "../../../shared/money";
import { addDays } from "../../../shared/planner";
import { eveningMessage, morningMessage, weeklyMessage, type BriefingInput } from "../../../shared/briefing";
import type { Db } from "../db";
import { getOverview } from "./money/overview";
import { readyWants, savedCents } from "./money/wants";
import { getDay } from "./planner";
import { getWins } from "./wins";

export type BriefingKind = "morning" | "evening" | "weekly";

/** The text for one nudge, or "" to stay silent (also when the person hasn't switched nudges on). */
export async function getBriefing(
  db: Db,
  userId: string,
  kind: BriefingKind,
  ctx: { sections: readonly Feature[]; extras: readonly Extra[]; now?: Date },
): Promise<string> {
  if (!ctx.extras.includes("nudges")) return "";
  const now = ctx.now ?? new Date();
  const today = berlinToday(now);
  const tomorrow = addDays(today, 1);
  const planner = ctx.sections.includes("planner");
  const money = ctx.sections.includes("money");
  const wantsOn = ctx.extras.includes("wants");

  const energyOn = ctx.extras.includes("energy");
  const day = planner ? await getDay(db, userId, today, now, ctx.extras.includes("kind_streaks"), energyOn) : null;
  const habit = (h: {
    name: string;
    checked: boolean;
    streak: number;
    atRisk: boolean;
    frequency: "daily" | "weekly" | "monthly";
    timeOfDay: "morning" | "afternoon" | "evening" | "any";
  }) => ({
    name: h.name,
    checked: h.checked,
    streak: h.streak,
    atRisk: h.atRisk,
    frequency: h.frequency,
    timeOfDay: h.timeOfDay,
  });

  let bills: BriefingInput["bills"] = null;
  let leftCents: number | null = null;
  if (money) {
    const month = berlinMonth(now);
    const o = await getOverview(db, userId, month, now);
    leftCents = o.totals.leftCents;
    const all = [...o.bills];
    // Tomorrow can be the 1st of next month.
    if (tomorrow.slice(0, 7) !== month) all.push(...(await getOverview(db, userId, addMonths(month, 1), now)).bills);
    bills = all
      .filter((b) => b.status === "upcoming" && (b.dueOn === today || b.dueOn === tomorrow))
      .map((b) => ({ name: b.name, amountCents: b.amountCents, dueOn: b.dueOn }));
  }

  let wins: BriefingInput["wins"] = null;
  let insight: string | null = null;
  if (kind === "weekly" && planner) {
    const w = await getWins(db, userId, { now, sections: ctx.sections, extras: ctx.extras });
    wins = {
      total: w.total,
      tasksDone: w.tasksDone.length,
      habits: w.habits,
      shipped: (w.shipped ?? []).map((s) => s.project),
      noSpendDays: w.noSpendDays?.length ?? 0,
      dailyPercent: w.dailyPercent,
    };
    insight = w.insight;
  }

  const input: BriefingInput = {
    today,
    tomorrow,
    tasks: day ? day.tasks.map((t) => ({ text: t.text, done: t.done })) : null,
    daily: day ? day.habits.daily.map(habit) : [],
    weekly: day ? day.habits.weekly.map(habit) : [],
    monthly: day ? day.habits.monthly.map(habit) : [],
    bills,
    readyWants: wantsOn && money ? (await readyWants(db, userId, now)).map((w) => ({ name: w.name, priceCents: w.priceCents })) : null,
    wins,
    leftCents: kind === "weekly" ? leftCents : null,
    savedCents: kind === "weekly" && wantsOn && money ? await savedCents(db, userId) : null,
    timeOfDay: ctx.extras.includes("time_of_day"),
    energyAsk: kind === "evening" && energyOn && day !== null && day.energy === null,
    insight,
  };
  if (kind === "morning") return morningMessage(input);
  if (kind === "evening") return eveningMessage(input);
  return weeklyMessage(input);
}
