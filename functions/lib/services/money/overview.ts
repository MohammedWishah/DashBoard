import { and, asc, between, desc, eq, sql } from "drizzle-orm";
import {
  categories,
  debtPayments,
  debts,
  expenses,
  income,
  recurringBills,
  savingsContributions,
  savingsGoals,
} from "../../../../db/schema";
import {
  addMonths,
  barState,
  berlinMonth,
  berlinToday,
  categoryLeft,
  dueDateFor,
  monthBounds,
  monthTotals,
  paceSeries,
  speakEuro,
} from "../../../../shared/money";
import type {
  BillThisMonth,
  CategorySummary,
  MoneyCharts,
  MoneyLeft,
  MoneyOverview,
} from "../../../../shared/money-schemas";
import type { Db } from "../../db";
import { syncBills } from "./sync-bills";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const groupSumRecord = (rows: { day: string; total: number }[]) =>
  Object.fromEntries(groupSum(rows, (r) => r.day, (r) => Number(r.total)));

function groupSum<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + value(r));
  return out;
}

type BillRow = typeof recurringBills.$inferSelect;

/** Which bills belong to `month`, and whether each is already logged or still upcoming. */
function billsForMonth(
  bills: BillRow[],
  loggedBillIds: Set<string>,
  month: string,
  today: string,
  currentMonth: string,
): BillThisMonth[] {
  const out: BillThisMonth[] = [];
  for (const b of bills) {
    const dueOn = dueDateFor(b.dayOfMonth, month);
    const base = { id: b.id, name: b.name, categoryId: b.categoryId, amountCents: b.amountCents, dueOn };
    if (loggedBillIds.has(b.id)) {
      out.push({ ...base, status: "logged" });
    } else if (
      b.active &&
      month >= currentMonth &&
      dueOn > today &&
      dueOn >= b.startsOn &&
      !(b.loggedThrough && dueOn <= b.loggedThrough)
    ) {
      out.push({ ...base, status: "upcoming" });
    }
    // Anything else was skipped (its expense deleted), not started yet, or the bill is inactive.
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export async function getOverview(db: Db, userId: string, month?: string, now = new Date()): Promise<MoneyOverview> {
  const today = berlinToday(now);
  const currentMonth = berlinMonth(now);
  const m = month ?? currentMonth;
  const { start, end } = monthBounds(m);
  await syncBills(db, userId, today);

  const [cats, monthExpenses, bills, monthIncome, monthContrib, monthPayments, goals, goalTotals, debtRows, debtTotals] =
    await db.batch([
      db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.sortOrder), asc(categories.name)),
      db
        .select()
        .from(expenses)
        .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end)))
        .orderBy(desc(expenses.spentOn), desc(expenses.createdAt)),
      db.select().from(recurringBills).where(eq(recurringBills.userId, userId)),
      db
        .select()
        .from(income)
        .where(and(eq(income.userId, userId), between(income.receivedOn, start, end)))
        .orderBy(desc(income.receivedOn)),
      db
        .select({ total: sql<number>`coalesce(sum(${savingsContributions.amountCents}), 0)` })
        .from(savingsContributions)
        .where(and(eq(savingsContributions.userId, userId), between(savingsContributions.onDate, start, end))),
      db
        .select({ total: sql<number>`coalesce(sum(${debtPayments.amountCents}), 0)` })
        .from(debtPayments)
        .where(and(eq(debtPayments.userId, userId), between(debtPayments.paidOn, start, end))),
      db
        .select()
        .from(savingsGoals)
        .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.archived, false)))
        .orderBy(asc(savingsGoals.createdAt)),
      db
        .select({ goalId: savingsContributions.goalId, total: sql<number>`sum(${savingsContributions.amountCents})` })
        .from(savingsContributions)
        .where(eq(savingsContributions.userId, userId))
        .groupBy(savingsContributions.goalId),
      db.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.archived, false))).orderBy(asc(debts.createdAt)),
      db
        .select({ debtId: debtPayments.debtId, total: sql<number>`sum(${debtPayments.amountCents})` })
        .from(debtPayments)
        .where(eq(debtPayments.userId, userId))
        .groupBy(debtPayments.debtId),
    ]);

  const spentBy = groupSum(monthExpenses, (e) => e.categoryId, (e) => e.amountCents);
  const loggedBillIds = new Set(monthExpenses.flatMap((e) => (e.recurringBillId ? [e.recurringBillId] : [])));
  const monthBills = billsForMonth(bills, loggedBillIds, m, today, currentMonth);
  const upcomingBy = groupSum(
    monthBills.filter((b) => b.status === "upcoming"),
    (b) => b.categoryId,
    (b) => b.amountCents,
  );

  const categorySummaries: CategorySummary[] = cats
    .filter((c) => !c.archived || spentBy.has(c.id))
    .map((c) => {
      const spentCents = spentBy.get(c.id) ?? 0;
      const upcomingCents = upcomingBy.get(c.id) ?? 0;
      return {
        ...c,
        spentCents,
        upcomingCents,
        leftCents: categoryLeft({ limitCents: c.monthlyLimitCents, spentCents, upcomingCents }),
        state: barState(c.monthlyLimitCents, spentCents + upcomingCents),
      };
    });

  const names = new Map(cats.map((c) => [c.id, c.name]));
  const goalSaved = new Map(goalTotals.map((g) => [g.goalId, Number(g.total)]));
  const debtPaid = new Map(debtTotals.map((d) => [d.debtId, Number(d.total)]));
  const isCurrentMonth = m === currentMonth;

  return {
    month: m,
    today,
    isCurrentMonth,
    totals: monthTotals({
      incomeCents: sum(monthIncome.map((i) => i.amountCents)),
      expenseCents: sum(monthExpenses.map((e) => e.amountCents)),
      savedCents: Number(monthContrib[0]?.total ?? 0),
      debtPaidCents: Number(monthPayments[0]?.total ?? 0),
    }),
    categories: categorySummaries,
    bills: monthBills,
    nextBill: isCurrentMonth ? (monthBills.find((b) => b.status === "upcoming") ?? null) : null,
    recentExpenses: monthExpenses.slice(0, 10).map((e) => ({ ...e, categoryName: names.get(e.categoryId) ?? "Unknown" })),
    expenseCount: monthExpenses.length,
    income: monthIncome,
    goals: goals.map((g) => ({ ...g, savedCents: goalSaved.get(g.id) ?? 0 })),
    debts: debtRows.map((d) => {
      const paidCents = debtPaid.get(d.id) ?? 0;
      return { ...d, paidCents, balanceCents: Math.max(0, d.startingBalanceCents - paidCents) };
    }),
  };
}

export async function listExpenses(db: Db, userId: string, month?: string, now = new Date()) {
  const m = month ?? berlinMonth(now);
  const { start, end } = monthBounds(m);
  await syncBills(db, userId, berlinToday(now));
  const [cats, rows] = await db.batch([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    db
      .select()
      .from(expenses)
      .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end)))
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt)),
  ]);
  const names = new Map(cats.map((c) => [c.id, c.name]));
  return rows.map((e) => ({ ...e, categoryName: names.get(e.categoryId) ?? "Unknown" }));
}

export async function getCharts(db: Db, userId: string, month?: string, now = new Date()): Promise<MoneyCharts> {
  const today = berlinToday(now);
  const m = month ?? berlinMonth(now);
  const { start, end } = monthBounds(m);
  const firstMonth = addMonths(m, -5);
  const rangeStart = monthBounds(firstMonth).start;
  await syncBills(db, userId, today);

  const [cats, daily, byCat, monthlyExp, monthlyInc, debtRows, payments] = await db.batch([
    db.select().from(categories).where(eq(categories.userId, userId)),
    db
      .select({
        day: expenses.spentOn,
        categoryId: expenses.categoryId,
        total: sql<number>`sum(${expenses.amountCents})`,
      })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end)))
      .groupBy(expenses.spentOn, expenses.categoryId),
    db
      .select({ categoryId: expenses.categoryId, total: sql<number>`sum(${expenses.amountCents})` })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end)))
      .groupBy(expenses.categoryId),
    db
      .select({ month: sql<string>`substr(${expenses.spentOn}, 1, 7)`, total: sql<number>`sum(${expenses.amountCents})` })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), between(expenses.spentOn, rangeStart, end)))
      .groupBy(sql`substr(${expenses.spentOn}, 1, 7)`),
    db
      .select({ month: sql<string>`substr(${income.receivedOn}, 1, 7)`, total: sql<number>`sum(${income.amountCents})` })
      .from(income)
      .where(and(eq(income.userId, userId), between(income.receivedOn, rangeStart, end)))
      .groupBy(sql`substr(${income.receivedOn}, 1, 7)`),
    db.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.archived, false))).orderBy(asc(debts.createdAt)),
    db.select().from(debtPayments).where(eq(debtPayments.userId, userId)).orderBy(asc(debtPayments.paidOn)),
  ]);

  // With limits set, the pace line tracks only limited (flexible) categories against
  // their combined limit, so unlimited fixed costs like rent don't swamp it.
  const limited = cats.filter((c) => !c.archived && c.monthlyLimitCents !== null);
  const budgetCents = limited.length > 0 ? sum(limited.map((c) => c.monthlyLimitCents!)) : null;
  const limitedIds = new Set(limited.map((c) => c.id));
  const paceRows = budgetCents === null ? daily : daily.filter((d) => limitedIds.has(d.categoryId));
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const expByMonth = new Map(monthlyExp.map((r) => [r.month, Number(r.total)]));
  const incByMonth = new Map(monthlyInc.map((r) => [r.month, Number(r.total)]));

  return {
    month: m,
    hasBudget: budgetCents !== null,
    pace: paceSeries({
      month: m,
      today,
      dailyCents: groupSumRecord(paceRows),
      budgetCents,
    }),
    byCategory: byCat
      .map((r) => ({ categoryId: r.categoryId, name: names.get(r.categoryId) ?? "Unknown", spentCents: Number(r.total) }))
      .filter((r) => r.spentCents > 0)
      .sort((a, b) => b.spentCents - a.spentCents),
    months: Array.from({ length: 6 }, (_, i) => {
      const mm = addMonths(firstMonth, i);
      return { month: mm, incomeCents: incByMonth.get(mm) ?? 0, expenseCents: expByMonth.get(mm) ?? 0 };
    }),
    debts: debtRows.map((d) => {
      let balance = d.startingBalanceCents;
      const points = [{ date: d.startedOn, balanceCents: balance }];
      for (const p of payments.filter((p) => p.debtId === d.id)) {
        balance = Math.max(0, balance - p.amountCents);
        points.push({ date: p.paidOn, balanceCents: balance });
      }
      return { id: d.id, name: d.name, points };
    }),
  };
}

/** Short answer for the voice assistant. */
export async function getMoneyLeft(db: Db, userId: string, now = new Date()): Promise<MoneyLeft> {
  const o = await getOverview(db, userId, undefined, now);
  const limited = o.categories.filter((c) => c.leftCents !== null && !c.archived);
  const left = o.totals.leftCents;
  const parts = [left >= 0 ? `You have ${speakEuro(left)} left this month.` : `You are ${speakEuro(-left)} over this month.`];
  for (const c of limited) {
    if (c.state === "over") parts.push(`${c.name} is ${speakEuro(-c.leftCents!)} over.`);
    else if (c.state === "warn") parts.push(`${c.name} has ${speakEuro(c.leftCents!)} left.`);
  }
  return {
    month: o.month,
    leftCents: left,
    categories: limited.map((c) => ({ name: c.name, leftCents: c.leftCents! })),
    speech: parts.join(" "),
  };
}

