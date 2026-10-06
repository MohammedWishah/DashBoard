import { berlinToday } from "../../../shared/money";
import { periodFor, periodLabel } from "../../../shared/planner";
import type { DayView } from "../../../shared/planner-schemas";
import { normalizeName } from "../../../shared/rules";
import type { Db } from "../db";
import { ApiError } from "../errors";
import { findHabitByName, getDay, putDayTasks, setCheck, updateTask } from "./planner";

// Voice-agent side of the Planner. The agent sends names and plain text; this file
// matches them and writes short replies that read well in a chat.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ");

export function planSpeech(day: DayView): string {
  const parts: string[] = [];
  parts.push(
    day.tasks.length === 0
      ? `No top 3 set for ${day.date === day.today ? "today" : day.date}.`
      : `Top 3: ${day.tasks.map((t) => (t.done ? `${t.text} (done)` : t.text)).join(", ")}.`,
  );
  const leftDaily = day.habits.daily.filter((h) => !h.checked);
  if (day.habits.daily.length > 0) {
    parts.push(leftDaily.length === 0 ? "All daily habits done." : `Habits left today: ${names(leftDaily)}.`);
  }
  const leftWeekly = day.habits.weekly.filter((h) => !h.checked);
  if (leftWeekly.length > 0) parts.push(`This week: ${names(leftWeekly)}.`);
  const leftMonthly = day.habits.monthly.filter((h) => !h.checked);
  if (leftMonthly.length > 0) parts.push(`This month: ${names(leftMonthly)}.`);
  return parts.join(" ");
}

export async function agentToday(db: Db, userId: string, kind = false, now = new Date()) {
  const day = await getDay(db, userId, undefined, now, kind);
  return { ...day, speech: planSpeech(day) };
}

export async function agentCheck(
  db: Db,
  userId: string,
  input: { habit: string; date?: string },
  checked: boolean,
  kind = false,
  now = new Date(),
) {
  const today = berlinToday(now);
  const habit = await findHabitByName(db, userId, input.habit);
  const period = periodFor(habit.frequency, input.date ?? today);
  await setCheck(db, userId, habit.id, period, checked, today);
  const label = periodLabel(habit.frequency, period, today);
  let speech = `${checked ? "Ticked" : "Unticked"} ${habit.name} for ${label}.`;
  if (checked && habit.frequency !== "monthly") {
    const day = await getDay(db, userId, undefined, now, kind);
    const s = [...day.habits.daily, ...day.habits.weekly].find((h) => h.id === habit.id)?.streak ?? 0;
    if (s > 0) speech += ` 🔥 ${plural(s, habit.frequency === "daily" ? "day" : "week")}.`;
  }
  return { habit: habit.name, frequency: habit.frequency, period, checked, speech };
}

export async function agentSetTasks(db: Db, userId: string, input: { tasks: string[]; date?: string }, now = new Date()) {
  const today = berlinToday(now);
  const day = input.date ?? today;
  const tasks = await putDayTasks(db, userId, day, input.tasks.map((text) => ({ text, done: false })));
  return { tasks, speech: `Top 3 for ${day === today ? "today" : day}: ${tasks.map((t) => t.text).join(", ")}.` };
}

export async function agentTaskDone(db: Db, userId: string, input: { task: string; date?: string }, now = new Date()) {
  const day = await getDay(db, userId, input.date, now);
  const ref = input.task.trim();
  const target = /^[1-3]$/.test(ref)
    ? day.tasks.find((t) => t.position === Number(ref))
    : day.tasks.find((t) => normalizeName(t.text) === normalizeName(ref));
  if (!target) {
    throw new ApiError(404, "unknown_task", `No top-3 task "${input.task}" on ${day.date}.`, { tasks: day.tasks.map((t) => t.text) });
  }
  const task = await updateTask(db, userId, target.id, { done: true });
  const doneCount = day.tasks.filter((t) => t.done || t.id === task.id).length;
  return { task, speech: `Done: ${task.text}. ${doneCount} of ${day.tasks.length} done.` };
}
