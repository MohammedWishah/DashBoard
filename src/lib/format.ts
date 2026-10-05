import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";

export function touchedAgo(iso: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(iso));
  if (days === 0) return "touched today";
  if (days === 1) return "touched yesterday";
  return `touched ${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function daysUntouched(iso: string): number {
  return differenceInCalendarDays(new Date(), new Date(iso));
}
