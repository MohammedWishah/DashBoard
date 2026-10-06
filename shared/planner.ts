// Pure planner rules shared by the API and the UI. No zod, no I/O.
// Dates are Berlin calendar dates "YYYY-MM-DD", months "YYYY-MM". Weeks start on Monday.

import { berlinToday, daysInMonth } from "./money";

export const FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "any"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const HABIT_LIMITS: Record<Frequency, number> = { daily: 50, weekly: 20, monthly: 40 };
export const MAX_DAY_TASKS = 3;

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function mondayOf(date: string): string {
  const dow = (utc(date).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

export function periodFor(f: Frequency, date: string): string {
  if (f === "daily") return date;
  if (f === "weekly") return mondayOf(date);
  return `${date.slice(0, 7)}-01`;
}

export const isValidPeriod = (f: Frequency, period: string) => periodFor(f, period) === period;

export const isFuturePeriod = (f: Frequency, period: string, today: string) => period > periodFor(f, today);

export function daysOfMonth(month: string): string[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export const mondaysInMonth = (month: string) => daysOfMonth(month).filter((d) => mondayOf(d) === d);

/** The Berlin calendar day an ISO timestamp falls on. */
export const createdDay = (createdAtIso: string) => berlinToday(new Date(createdAtIso));

/** Periods in a row up to now. Today's (or this week's) open period doesn't break it. */
export function streak(f: Frequency, checked: ReadonlySet<string>, today: string): number {
  if (f === "monthly") return 0;
  const step = f === "daily" ? 1 : 7;
  let p = periodFor(f, today);
  if (!checked.has(p)) p = addDays(p, -step);
  let n = 0;
  while (checked.has(p)) {
    n++;
    p = addDays(p, -step);
  }
  return n;
}

/**
 * "Never miss twice": like `streak`, but a single missed period between ticks is skipped
 * (it doesn't count and doesn't break). Two misses in a row end it.
 */
export function kindStreak(f: Frequency, checked: ReadonlySet<string>, today: string): number {
  if (f === "monthly" || checked.size === 0) return 0;
  const step = f === "daily" ? 1 : 7;
  const earliest = [...checked].reduce((a, b) => (a < b ? a : b));
  let p = periodFor(f, today);
  if (!checked.has(p)) p = addDays(p, -step);
  let n = 0;
  let misses = 0;
  while (p >= earliest) {
    if (checked.has(p)) {
      n++;
      misses = 0;
    } else if (++misses === 2) {
      break;
    }
    p = addDays(p, -step);
  }
  return n;
}

/** The previous period was missed, the current one is still open, and the streak is still alive. */
export function atRisk(f: Frequency, checked: ReadonlySet<string>, today: string): boolean {
  if (f === "monthly") return false;
  const step = f === "daily" ? 1 : 7;
  const current = periodFor(f, today);
  const previous = addDays(current, -step);
  return !checked.has(current) && !checked.has(previous) && checked.has(addDays(previous, -step));
}

/** Share of the month's elapsed periods ticked, counting only periods since the habit existed. Null when none elapsed. */
export function habitPercent(
  f: "daily" | "weekly",
  createdOn: string,
  checked: ReadonlySet<string>,
  month: string,
  today: string,
): number | null {
  const periods =
    f === "daily"
      ? daysOfMonth(month).filter((d) => d <= today && d >= createdOn)
      : mondaysInMonth(month).filter((m) => m <= mondayOf(today) && m >= mondayOf(createdOn));
  if (periods.length === 0) return null;
  return Math.round((100 * periods.filter((p) => checked.has(p)).length) / periods.length);
}

/** For the progress chart: each day's share of daily habits ticked. Null for future days and days with no habits. */
export function dayPercents(
  habits: { id: string; createdOn: string; archivedOn?: string | null }[],
  checks: ReadonlyMap<string, ReadonlySet<string>>,
  month: string,
  today: string,
): { date: string; percent: number | null }[] {
  return daysOfMonth(month).map((date) => {
    if (date > today) return { date, percent: null };
    // An archived habit counts only up to the day before it was archived.
    const eligible = habits.filter((h) => h.createdOn <= date && (!h.archivedOn || date < h.archivedOn));
    if (eligible.length === 0) return { date, percent: null };
    const done = eligible.filter((h) => checks.get(h.id)?.has(date)).length;
    return { date, percent: Math.round((100 * done) / eligible.length) };
  });
}

export function topHabits<T extends { name: string; percent: number | null; streak: number }>(rows: T[], n = 10): T[] {
  return rows
    .filter((r) => r.percent !== null)
    .sort((a, b) => b.percent! - a.percent! || b.streak - a.streak || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** "today", "this week", "the week of 2026-09-28", "2026-09"... for agent replies. */
export function periodLabel(f: Frequency, period: string, today: string): string {
  const current = period === periodFor(f, today);
  if (f === "daily") return current ? "today" : period;
  if (f === "weekly") return current ? "this week" : `the week of ${period}`;
  return current ? "this month" : period.slice(0, 7);
}
