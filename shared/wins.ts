// Wins: small finished things, counted for the week. Pure; no I/O.

import { addDays, type Frequency } from "./planner";

export type WinsView = {
  week: string;
  days: string[];
  today: string;
  tasksDone: { day: string; text: string }[];
  habits: { name: string; frequency: Frequency; count: number }[];
  dailyPercent: number | null;
  shipped: { project: string; note: string | null; day: string }[] | null;
  noSpendDays: string[] | null;
  skipped: { name: string; priceCents: number; day: string }[] | null;
  total: number;
};

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Days up to today, on or after the first expense ever, with no spending except bills. */
export function noSpendDays(days: string[], spendDays: ReadonlySet<string>, today: string, since: string | null): string[] {
  if (since === null) return [];
  return days.filter((d) => d <= today && d >= since && !spendDays.has(d));
}

/** Share of daily-habit ticks over the week's elapsed days, counting each habit from its first day. */
export function weekHabitPercent(habits: { createdOn: string; checks: ReadonlySet<string> }[], days: string[], today: string): number | null {
  let possible = 0;
  let done = 0;
  for (const h of habits) {
    for (const d of days) {
      if (d > today || d < h.createdOn) continue;
      possible++;
      if (h.checks.has(d)) done++;
    }
  }
  return possible === 0 ? null : Math.round((100 * done) / possible);
}

export function winsTotal(w: {
  tasksDone: unknown[];
  habits: { count: number }[];
  shipped: unknown[] | null;
  noSpendDays: unknown[] | null;
  skipped: unknown[] | null;
}): number {
  return (
    w.tasksDone.length +
    w.habits.reduce((n, h) => n + h.count, 0) +
    (w.shipped?.length ?? 0) +
    (w.noSpendDays?.length ?? 0) +
    (w.skipped?.length ?? 0)
  );
}
