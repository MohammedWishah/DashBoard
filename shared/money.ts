// Pure money rules shared by the API and the UI. No zod, no I/O.
// Dates are local Europe/Berlin calendar dates as "YYYY-MM-DD", months as "YYYY-MM".

import { normalizeName } from "./rules";

export const MONEY_TIME_ZONE = "Europe/Berlin";
export const MAX_AMOUNT_CENTS = 100_000_000; // €1,000,000
export const WARN_RATIO = 0.8;

const pad = (n: number) => String(n).padStart(2, "0");

const berlinDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MONEY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Berlin, e.g. "2026-10-06". */
export function berlinToday(now: Date = new Date()): string {
  return berlinDateFormat.format(now);
}

/** The current Berlin month, e.g. "2026-10". */
export function berlinMonth(now: Date = new Date()): string {
  return berlinToday(now).slice(0, 7);
}

function splitMonth(month: string): [number, number] {
  const [y, m] = month.split("-").map(Number);
  return [y, m];
}

export function daysInMonth(month: string): number {
  const [y, m] = splitMonth(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, n: number): string {
  const [y, m] = splitMonth(month);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthBounds(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` };
}

/** A bill's due date in a month. Days past the month's end clamp to its last day. */
export function dueDateFor(dayOfMonth: number, month: string): string {
  return `${month}-${pad(Math.min(dayOfMonth, daysInMonth(month)))}`;
}

export type BillSchedule = {
  dayOfMonth: number;
  startsOn: string;
  /** Last due date already turned into an expense, or null if none yet. */
  loggedThrough: string | null;
  active: boolean;
};

/**
 * Due dates that should become expenses now: on or after starts_on, after
 * logged_through, and not later than today. Because logged_through moves
 * forward, an auto-logged expense you delete is never recreated.
 */
export function planBillOccurrences(bill: BillSchedule, today: string): string[] {
  if (!bill.active) return [];
  const out: string[] = [];
  const last = today.slice(0, 7);
  for (let month = bill.startsOn.slice(0, 7); month <= last; month = addMonths(month, 1)) {
    const due = dueDateFor(bill.dayOfMonth, month);
    if (due < bill.startsOn || due > today) continue;
    if (bill.loggedThrough && due <= bill.loggedThrough) continue;
    out.push(due);
  }
  return out;
}

/** Due date of an active bill in `month` that is still ahead of `today`, or null. */
export function upcomingDueDate(bill: BillSchedule, month: string, today: string): string | null {
  if (!bill.active) return null;
  const due = dueDateFor(bill.dayOfMonth, month);
  if (due <= today || due < bill.startsOn) return null;
  if (bill.loggedThrough && due <= bill.loggedThrough) return null;
  return due;
}

export function categoryLeft(c: { limitCents: number | null; spentCents: number; upcomingCents: number }): number | null {
  return c.limitCents === null ? null : c.limitCents - c.spentCents - c.upcomingCents;
}

export type BarState = "none" | "ok" | "warn" | "over";

/** Bar color for a category: `committedCents` is spent plus upcoming bills. */
export function barState(limitCents: number | null, committedCents: number): BarState {
  if (limitCents === null) return "none";
  if (committedCents > limitCents) return "over";
  if (committedCents >= limitCents * WARN_RATIO) return "warn";
  return "ok";
}

export type MonthTotalsInput = {
  incomeCents: number;
  expenseCents: number;
  /** Net savings contributions (money taken out is negative). */
  savedCents: number;
  debtPaidCents: number;
};

export function monthTotals(t: MonthTotalsInput): MonthTotalsInput & { leftCents: number } {
  return { ...t, leftCents: t.incomeCents - t.expenseCents - t.savedCents - t.debtPaidCents };
}

/**
 * Parses what people type for an amount: "12", "12.5", "12,50", "1.234,56",
 * "1,234.56", "1 000". A single separator followed by 3 digits is read as a
 * thousands separator. Returns positive cents, or null when unclear.
 */
export function parseEuroToCents(input: string): number | null {
  const s = input.replace(/[€\s ]/g, "");
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;

  const seps = s.match(/[.,]/g) ?? [];
  let integer = s;
  let fraction = "";

  const kinds = new Set(seps);
  if (kinds.size === 2) {
    const decimalSep = s.at(Math.max(s.lastIndexOf("."), s.lastIndexOf(",")))!;
    const idx = s.lastIndexOf(decimalSep);
    integer = s.slice(0, idx);
    fraction = s.slice(idx + 1);
    if (integer.includes(decimalSep)) return null;
  } else if (seps.length === 1) {
    const idx = s.search(/[.,]/);
    const after = s.slice(idx + 1);
    if (after.length <= 2) {
      integer = s.slice(0, idx);
      fraction = after;
    } else if (after.length !== 3) {
      return null;
    }
  }

  const groups = integer.split(/[.,]/);
  if (groups.length > 1 && (groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3))) return null;
  if (fraction.length > 2) return null;

  const cents = Number(groups.join("")) * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

const euroFormat = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function formatEuro(cents: number): string {
  return euroFormat.format(cents / 100);
}

/** Largest single expense an agent may log: €100,000. */
export const MAX_AGENT_AMOUNT_CENTS = 10_000_000;
export const OTHER_CATEGORY_NAME = "Other";

/** Euros from an agent (e.g. 12.4) to cents. Null when not positive, over the max, or finer than a cent. */
export function eurosToCents(euros: number): number | null {
  if (!Number.isFinite(euros) || euros <= 0) return null;
  const cents = Math.round(euros * 100);
  if (Math.abs(cents - euros * 100) > 1e-6) return null;
  return cents > MAX_AGENT_AMOUNT_CENTS ? null : cents;
}

/** First category (in the given order) whose name matches, ignoring case and extra spaces. */
export function findCategoryByName<T extends { name: string }>(cats: T[], name: string): T | undefined {
  const key = normalizeName(name);
  return cats.find((c) => normalizeName(c.name) === key);
}

/** Whole euros for speech: 41250 -> "412 euros". */
export function speakEuro(cents: number): string {
  if (cents !== 0 && Math.abs(cents) < 100) return "less than 1 euro";
  const euros = Math.trunc(cents / 100);
  return `${Math.abs(euros) === 1 ? `${euros} euro` : `${euros} euros`}`;
}

export type PacePoint = { day: number; spentCents: number | null; budgetCents: number | null };

/**
 * Cumulative spending per day of `month`, plus a straight "on budget" line.
 * Days after today are null so the line stops at today.
 */
export function paceSeries(p: {
  month: string;
  today: string;
  dailyCents: Record<string, number>;
  budgetCents: number | null;
}): PacePoint[] {
  const days = daysInMonth(p.month);
  const out: PacePoint[] = [];
  let total = 0;
  for (let day = 1; day <= days; day++) {
    const date = `${p.month}-${pad(day)}`;
    total += p.dailyCents[date] ?? 0;
    out.push({
      day,
      spentCents: date > p.today ? null : total,
      budgetCents: p.budgetCents === null ? null : Math.round((p.budgetCents * day) / days),
    });
  }
  return out;
}

/** Want-list cooling-off: under €50 one day, up to €200 three days, above that a week. */
export function waitHours(priceCents: number): 24 | 72 | 168 {
  if (priceCents < 5000) return 24;
  if (priceCents <= 20000) return 72;
  return 168;
}

/** Whole months from `fromMonth` to `toMonth`, counting both ends: Oct to Dec is 3. */
export function monthsInclusive(fromMonth: string, toMonth: string): number {
  const [fy, fm] = splitMonth(fromMonth);
  const [ty, tm] = splitMonth(toMonth);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/**
 * What a goal needs per month to land on its date, counting this month.
 * Null without a date, once reached, or when the date has passed.
 */
export function goalMonthlyNeed(g: { savedCents: number; targetCents: number; targetDate: string | null }, today: string): number | null {
  if (!g.targetDate || g.targetDate < today || g.savedCents >= g.targetCents) return null;
  const months = monthsInclusive(today.slice(0, 7), g.targetDate.slice(0, 7));
  return Math.ceil((g.targetCents - g.savedCents) / months);
}

/**
 * New logged_through when a bill moves to another day. If it already logged this month,
 * the rest of this month counts as logged, so moving rent from the 1st to the 15th
 * doesn't charge it twice in October. Otherwise nothing changes.
 */
export function loggedThroughAfterDayChange(loggedThrough: string | null, today: string): string | null {
  const month = today.slice(0, 7);
  if (!loggedThrough || loggedThrough.slice(0, 7) !== month) return loggedThrough;
  return monthBounds(month).end;
}

// ---- Quick add suggestions ---------------------------------------------------

export type ExpenseHabitRow = { categoryId: string; note: string | null; amountCents: number; count: number; lastOn: string };
export type QuickPick = { categoryId: string; note: string | null; amountCents: number };
export type NoteSuggestion = { note: string; categoryId: string };

/** The expenses you log over and over (same category, note and amount, 3+ times): most frequent first. */
export function pickQuickPicks(rows: ExpenseHabitRow[], limit = 3): QuickPick[] {
  return rows
    .filter((r) => r.count >= 3)
    .sort((a, b) => b.count - a.count || b.lastOn.localeCompare(a.lastOn))
    .slice(0, limit)
    .map(({ categoryId, note, amountCents }) => ({ categoryId, note, amountCents }));
}

/** One suggestion per note (ignoring case), with the category it's used with most. Most used first. */
export function noteSuggestions(rows: ExpenseHabitRow[]): NoteSuggestion[] {
  const byNote = new Map<string, { note: string; total: number; lastOn: string; cats: Map<string, number> }>();
  for (const r of rows) {
    if (!r.note?.trim()) continue;
    const key = normalizeName(r.note);
    const entry = byNote.get(key) ?? { note: r.note.trim(), total: 0, lastOn: r.lastOn, cats: new Map() };
    entry.total += r.count;
    if (r.lastOn > entry.lastOn) entry.lastOn = r.lastOn;
    entry.cats.set(r.categoryId, (entry.cats.get(r.categoryId) ?? 0) + r.count);
    byNote.set(key, entry);
  }
  return [...byNote.values()]
    .sort((a, b) => b.total - a.total || b.lastOn.localeCompare(a.lastOn))
    .map((e) => ({ note: e.note, categoryId: [...e.cats.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
}

/** Suggestions whose note contains what's typed (2+ letters), notes that start with it first. */
export function matchNotes(suggestions: NoteSuggestion[], typed: string, limit = 3): NoteSuggestion[] {
  const q = normalizeName(typed);
  if (q.length < 2) return [];
  const hits = suggestions.filter((s) => {
    const n = normalizeName(s.note);
    return n.includes(q) && n !== q;
  });
  const starts = hits.filter((s) => normalizeName(s.note).startsWith(q));
  return [...starts, ...hits.filter((s) => !starts.includes(s))].slice(0, limit);
}

// ---- Month review --------------------------------------------------------------

export type MonthReviewInput = {
  month: string;
  totals: MonthTotalsInput;
  previousExpenseCents: number;
  categories: { id: string; name: string; monthlyLimitCents: number | null; archived: boolean }[];
  spentByCategory: Record<string, number>;
  previousByCategory: Record<string, number>;
  biggest: { categoryId: string; note: string | null; amountCents: number; spentOn: string } | null;
  savedByWaitingCents: number;
  expenseCount: number;
};

export type MonthReview = {
  month: string;
  totals: MonthTotalsInput & { leftCents: number };
  /** Spent this month minus the month before: negative means less. Null when the month before has nothing. */
  expenseDeltaCents: number | null;
  topCategories: { categoryId: string; name: string; spentCents: number; previousCents: number }[];
  /** Categories with a limit that stayed at or under it. */
  limits: { kept: number; total: number };
  biggest: { label: string; categoryName: string; amountCents: number; spentOn: string } | null;
  savedByWaitingCents: number;
  expenseCount: number;
};

export function monthReview(i: MonthReviewInput): MonthReview {
  const names = new Map(i.categories.map((c) => [c.id, c.name]));
  const name = (id: string) => names.get(id) ?? "Unknown";
  const limited = i.categories.filter((c) => c.monthlyLimitCents !== null && (!c.archived || (i.spentByCategory[c.id] ?? 0) > 0));
  return {
    month: i.month,
    totals: monthTotals(i.totals),
    expenseDeltaCents: i.previousExpenseCents > 0 ? i.totals.expenseCents - i.previousExpenseCents : null,
    topCategories: Object.entries(i.spentByCategory)
      .filter(([, cents]) => cents > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, cents]) => ({ categoryId: id, name: name(id), spentCents: cents, previousCents: i.previousByCategory[id] ?? 0 })),
    limits: {
      kept: limited.filter((c) => (i.spentByCategory[c.id] ?? 0) <= c.monthlyLimitCents!).length,
      total: limited.length,
    },
    biggest: i.biggest && {
      label: i.biggest.note || name(i.biggest.categoryId),
      categoryName: name(i.biggest.categoryId),
      amountCents: i.biggest.amountCents,
      spentOn: i.biggest.spentOn,
    },
    savedByWaitingCents: i.savedByWaitingCents,
    expenseCount: i.expenseCount,
  };
}
