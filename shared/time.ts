import { TZDate } from "@date-fns/tz";
import { startOfWeek, subDays } from "date-fns";

export const STALE_AFTER_DAYS = 30;
export const WEEK_TIME_ZONE = "Europe/Berlin";

/** A project is stale when it has not been touched for more than 30 days. */
export function isStale(lastTouched: string, now: Date = new Date()): boolean {
  return new Date(lastTouched).getTime() < subDays(now, STALE_AFTER_DAYS).getTime();
}

/** Monday 00:00 Europe/Berlin of the current week, as a UTC ISO string. */
export function startOfBerlinWeek(now: Date = new Date()): string {
  const monday = startOfWeek(new TZDate(now.getTime(), WEEK_TIME_ZONE), { weekStartsOn: 1 });
  return new Date(monday.getTime()).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}
