import { and, asc, count, eq, inArray } from "drizzle-orm";
import { dayTasks, habitChecks, habits } from "../../../db/schema";
import { berlinMonth, berlinToday } from "../../../shared/money";
import {
  HABIT_LIMITS,
  createdDay,
  dayPercents,
  daysOfMonth,
  habitPercent,
  isFuturePeriod,
  isValidPeriod,
  mondaysInMonth,
  periodFor,
  streak,
  topHabits,
  type Frequency,
} from "../../../shared/planner";
import type {
  DayHabit,
  DayTaskRow,
  DayView,
  HabitCreate,
  HabitRow,
  HabitUpdate,
  MonthView,
  TaskUpdate,
} from "../../../shared/planner-schemas";
import { normalizeName } from "../../../shared/rules";
import { nowIso } from "../../../shared/time";
import type { Db } from "../db";
import { ApiError, notFound } from "../errors";

// Every function takes the signed-in user's id. Lookups match on (id, user_id), so another
// user's id behaves exactly like an id that doesn't exist: 404.

const newId = () => crypto.randomUUID();
const strip = <T extends { userId: string }>({ userId: _owner, ...rest }: T) => rest;

// ---- Habits -------------------------------------------------------------------

export async function listHabits(db: Db, userId: string): Promise<HabitRow[]> {
  const rows = await db.select().from(habits).where(eq(habits.userId, userId)).orderBy(asc(habits.sortOrder), asc(habits.name));
  return rows.map(strip);
}

async function getHabit(db: Db, userId: string, id: string): Promise<HabitRow> {
  const row = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .get();
  if (!row) throw notFound("Habit");
  return strip(row);
}

async function assertNameFree(db: Db, userId: string, name: string, exceptId?: string) {
  const clash = (await listHabits(db, userId)).find((h) => h.id !== exceptId && normalizeName(h.name) === normalizeName(name));
  if (clash) throw new ApiError(409, "name_taken", `A habit named "${clash.name}" already exists`);
}

async function assertUnderLimit(db: Db, userId: string, frequency: Frequency) {
  const row = await db
    .select({ n: count() })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.frequency, frequency), eq(habits.archived, false)))
    .get();
  if ((row?.n ?? 0) >= HABIT_LIMITS[frequency]) {
    throw new ApiError(409, "habit_limit", `You can have at most ${HABIT_LIMITS[frequency]} ${frequency} habits. Archive one first.`);
  }
}

export async function createHabit(db: Db, userId: string, input: HabitCreate): Promise<HabitRow> {
  await assertNameFree(db, userId, input.name);
  await assertUnderLimit(db, userId, input.frequency);
  const all = await listHabits(db, userId);
  const row = {
    id: newId(),
    userId,
    name: input.name,
    frequency: input.frequency,
    sortOrder: all.reduce((m, h) => Math.max(m, h.sortOrder + 1), 0),
    archived: false,
    createdAt: nowIso(),
  };
  await db.insert(habits).values(row);
  return strip(row);
}

export async function updateHabit(db: Db, userId: string, id: string, patch: HabitUpdate): Promise<HabitRow> {
  const habit = await getHabit(db, userId, id);
  if (patch.name !== undefined) await assertNameFree(db, userId, patch.name, id);
  if (patch.archived === false && habit.archived) await assertUnderLimit(db, userId, habit.frequency);
  if (Object.keys(patch).length === 0) return habit;
  await db
    .update(habits)
    .set(patch)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
  return getHabit(db, userId, id);
}

export async function deleteHabit(db: Db, userId: string, id: string) {
  await getHabit(db, userId, id);
  await db.batch([
    db.delete(habitChecks).where(and(eq(habitChecks.habitId, id), eq(habitChecks.userId, userId))),
    db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId))),
  ]);
}

/** Matches a spoken habit name against active habits. */
export async function findHabitByName(db: Db, userId: string, name: string): Promise<HabitRow> {
  const active = (await listHabits(db, userId)).filter((h) => !h.archived);
  const match = active.find((h) => normalizeName(h.name) === normalizeName(name));
  if (match) return match;
  throw new ApiError(404, "unknown_habit", `No habit named "${name}". Pick the closest of these, or ask.`, {
    habits: active.map((h) => ({ name: h.name, frequency: h.frequency })),
  });
}

// ---- Checks -------------------------------------------------------------------

export async function setCheck(db: Db, userId: string, habitId: string, period: string, checked: boolean, today = berlinToday()) {
  const habit = await getHabit(db, userId, habitId);
  if (checked && habit.archived) {
    throw new ApiError(409, "habit_archived", `${habit.name} is archived. Restore it to tick it again.`);
  }
  if (!isValidPeriod(habit.frequency, period)) {
    const hint = habit.frequency === "weekly" ? "a Monday" : habit.frequency === "monthly" ? "the 1st of a month" : "a date";
    throw new ApiError(400, "invalid_period", `${habit.name} is ${habit.frequency}, so the period must be ${hint}`);
  }
  if (checked && isFuturePeriod(habit.frequency, period, today)) {
    throw new ApiError(400, "future_period", "You can't tick a period that hasn't started yet");
  }
  if (checked) {
    await db.insert(habitChecks).values({ habitId, userId, period, createdAt: nowIso() }).onConflictDoNothing();
  } else {
    await db.delete(habitChecks).where(and(eq(habitChecks.habitId, habitId), eq(habitChecks.userId, userId), eq(habitChecks.period, period)));
  }
  return { habit, period, checked };
}

/** All checks of the given habits, grouped by habit id. */
async function checksByHabit(db: Db, userId: string, habitIds: string[]) {
  const map = new Map<string, Set<string>>(habitIds.map((id) => [id, new Set<string>()]));
  if (habitIds.length === 0) return map;
  const rows = await db
    .select({ habitId: habitChecks.habitId, period: habitChecks.period })
    .from(habitChecks)
    .where(and(eq(habitChecks.userId, userId), inArray(habitChecks.habitId, habitIds)));
  for (const r of rows) map.get(r.habitId)?.add(r.period);
  return map;
}

// ---- Day ----------------------------------------------------------------------

async function listTasks(db: Db, userId: string, day: string): Promise<DayTaskRow[]> {
  const rows = await db
    .select()
    .from(dayTasks)
    .where(and(eq(dayTasks.userId, userId), eq(dayTasks.day, day)))
    .orderBy(asc(dayTasks.position));
  return rows.map(strip);
}

export async function getDay(db: Db, userId: string, date?: string, now = new Date()): Promise<DayView> {
  const today = berlinToday(now);
  const day = date ?? today;
  const active = (await listHabits(db, userId)).filter((h) => !h.archived);
  const checks = await checksByHabit(db, userId, active.map((h) => h.id));
  const view = (h: HabitRow): DayHabit => {
    const set = checks.get(h.id)!;
    return { ...h, checked: set.has(periodFor(h.frequency, day)), streak: streak(h.frequency, set, today) };
  };
  return {
    date: day,
    today,
    tasks: await listTasks(db, userId, day),
    habits: {
      daily: active.filter((h) => h.frequency === "daily").map(view),
      weekly: active.filter((h) => h.frequency === "weekly").map(view),
      monthly: active.filter((h) => h.frequency === "monthly").map(view),
    },
  };
}

export async function putDayTasks(db: Db, userId: string, day: string, tasks: { text: string; done: boolean }[]) {
  const rows = tasks.map((t, i) => ({ id: newId(), userId, day, position: i + 1, text: t.text, done: t.done, createdAt: nowIso() }));
  const del = db.delete(dayTasks).where(and(eq(dayTasks.userId, userId), eq(dayTasks.day, day)));
  if (rows.length === 0) await del;
  else await db.batch([del, db.insert(dayTasks).values(rows)]);
  return listTasks(db, userId, day);
}

export async function updateTask(db: Db, userId: string, id: string, patch: TaskUpdate): Promise<DayTaskRow> {
  const where = and(eq(dayTasks.id, id), eq(dayTasks.userId, userId));
  const row = await db.select().from(dayTasks).where(where).get();
  if (!row) throw notFound("Task");
  if (Object.keys(patch).length > 0) await db.update(dayTasks).set(patch).where(where);
  return strip({ ...row, ...patch });
}

// ---- Month --------------------------------------------------------------------

export async function getMonth(db: Db, userId: string, month?: string, now = new Date()): Promise<MonthView> {
  const today = berlinToday(now);
  const m = month ?? berlinMonth(now);
  const days = daysOfMonth(m);
  const mondays = mondaysInMonth(m);
  const active = (await listHabits(db, userId)).filter((h) => !h.archived);
  const checks = await checksByHabit(db, userId, active.map((h) => h.id));
  const created = (h: HabitRow) => createdDay(h.createdAt);

  const daily = active
    .filter((h) => h.frequency === "daily")
    .map((h) => {
      const set = checks.get(h.id)!;
      return {
        habit: h,
        checks: days.filter((d) => set.has(d)),
        percent: habitPercent("daily", created(h), set, m, today),
        streak: streak("daily", set, today),
      };
    });
  const weekly = active
    .filter((h) => h.frequency === "weekly")
    .map((h) => {
      const set = checks.get(h.id)!;
      return {
        habit: h,
        weeks: mondays.map((monday) => ({ monday, checked: set.has(monday) })),
        percent: habitPercent("weekly", created(h), set, m, today),
        streak: streak("weekly", set, today),
      };
    });
  const monthly = active.filter((h) => h.frequency === "monthly").map((h) => ({ habit: h, checked: checks.get(h.id)!.has(`${m}-01`) }));

  return {
    month: m,
    today,
    days,
    mondays,
    daily,
    dayPercents: dayPercents(daily.map((r) => ({ id: r.habit.id, createdOn: created(r.habit) })), checks, m, today),
    weekly,
    monthly,
    top: topHabits([
      ...daily.map((r) => ({ id: r.habit.id, name: r.habit.name, frequency: "daily" as const, percent: r.percent, streak: r.streak })),
      ...weekly.map((r) => ({ id: r.habit.id, name: r.habit.name, frequency: "weekly" as const, percent: r.percent, streak: r.streak })),
    ]),
  };
}
