import { and, asc, between, eq, isNull, min } from "drizzle-orm";
import { dayTasks, expenses, habitChecks, habits, projects, shippedEvents } from "../../../db/schema";
import type { Extra, Feature } from "../../../shared/features";
import { berlinToday } from "../../../shared/money";
import { addDays, createdDay, isValidPeriod, mondayOf } from "../../../shared/planner";
import { noSpendDays, weekDays, weekHabitPercent, winsTotal, type WinsView } from "../../../shared/wins";
import type { Db } from "../db";
import { ApiError } from "../errors";
import { skippedBetween } from "./money/wants";

/** Berlin day of an ISO timestamp. */
const dayOf = (iso: string) => berlinToday(new Date(iso));

export async function getWins(
  db: Db,
  userId: string,
  opts: { week?: string; now?: Date; sections: readonly Feature[]; extras: readonly Extra[] },
): Promise<WinsView> {
  const now = opts.now ?? new Date();
  const today = berlinToday(now);
  const monday = opts.week ?? mondayOf(today);
  if (!isValidPeriod("weekly", monday)) throw new ApiError(400, "invalid_week", "Use the Monday of the week, like 2026-10-05");
  const days = weekDays(monday);
  const [first, last] = [days[0], days[6]];

  const [tasks, habitRows, checkRows] = await db.batch([
    db
      .select({ day: dayTasks.day, text: dayTasks.text })
      .from(dayTasks)
      .where(and(eq(dayTasks.userId, userId), between(dayTasks.day, first, last), eq(dayTasks.done, true)))
      .orderBy(asc(dayTasks.day), asc(dayTasks.position)),
    db.select().from(habits).where(and(eq(habits.userId, userId), eq(habits.archived, false))),
    db
      .select({ habitId: habitChecks.habitId, period: habitChecks.period })
      .from(habitChecks)
      .where(and(eq(habitChecks.userId, userId), between(habitChecks.period, first, last))),
  ]);

  const byHabit = new Map<string, Set<string>>();
  for (const c of checkRows) byHabit.set(c.habitId, (byHabit.get(c.habitId) ?? new Set()).add(c.period));
  const counted = habitRows.filter((h) => h.frequency !== "monthly");
  const habitWins = counted
    .map((h) => ({ name: h.name, frequency: h.frequency, count: byHabit.get(h.id)?.size ?? 0 }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const dailyPercent = weekHabitPercent(
    counted.filter((h) => h.frequency === "daily").map((h) => ({ createdOn: createdDay(h.createdAt), checks: byHabit.get(h.id) ?? new Set() })),
    days,
    today,
  );

  let shipped: WinsView["shipped"] = null;
  if (opts.sections.includes("projects")) {
    // shipped_at is UTC; widen by a day each side, then keep the Berlin days in the week.
    const rows = await db
      .select({ project: projects.name, note: shippedEvents.note, shippedAt: shippedEvents.shippedAt })
      .from(shippedEvents)
      .innerJoin(projects, eq(projects.id, shippedEvents.projectId))
      .where(and(eq(shippedEvents.userId, userId), between(shippedEvents.shippedAt, addDays(first, -1), addDays(last, 2))));
    shipped = rows.map((r) => ({ project: r.project, note: r.note, day: dayOf(r.shippedAt) })).filter((r) => r.day >= first && r.day <= last);
  }

  let noSpend: string[] | null = null;
  if (opts.sections.includes("money")) {
    const [spent, firstEver] = await db.batch([
      db
        .select({ day: expenses.spentOn })
        .from(expenses)
        .where(and(eq(expenses.userId, userId), between(expenses.spentOn, first, last), isNull(expenses.recurringBillId))),
      // Count from the first expense the person logged themselves; bills alone don't start it.
      db
        .select({ since: min(expenses.spentOn) })
        .from(expenses)
        .where(and(eq(expenses.userId, userId), isNull(expenses.recurringBillId))),
    ]);
    noSpend = noSpendDays(days, new Set(spent.map((s) => s.day)), today, firstEver[0]?.since ?? null);
  }

  let skipped: WinsView["skipped"] = null;
  if (opts.extras.includes("wants")) {
    const rows = await skippedBetween(db, userId, `${addDays(first, -1)}T00:00:00.000Z`, `${addDays(last, 2)}T00:00:00.000Z`);
    skipped = rows
      .map((w) => ({ name: w.name, priceCents: w.priceCents, day: dayOf(w.decidedAt!) }))
      .filter((w) => w.day >= first && w.day <= last);
  }

  const view = { week: monday, days, today, tasksDone: tasks, habits: habitWins, dailyPercent, shipped, noSpendDays: noSpend, skipped };
  return { ...view, total: winsTotal(view) };
}
