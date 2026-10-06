import { and, between, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { categories, debtPayments, expenses, income, savingsContributions, wants } from "../../../../db/schema";
import {
  addMonths,
  berlinMonth,
  berlinToday,
  monthBounds,
  monthReview,
  noteSuggestions,
  pickQuickPicks,
  type MonthReview,
} from "../../../../shared/money";
import type { MoneySuggestions } from "../../../../shared/money-schemas";
import { addDays } from "../../../../shared/planner";
import type { Db } from "../../db";
import { syncBills } from "./sync-bills";

const byCategory = (rows: { categoryId: string; total: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.categoryId, Number(r.total)]));

const spentPerCategory = (db: Db, userId: string, month: string) => {
  const { start, end } = monthBounds(month);
  return db
    .select({ categoryId: expenses.categoryId, total: sql<number>`sum(${expenses.amountCents})` })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end)))
    .groupBy(expenses.categoryId);
};

/** A look back at one month: totals, top categories against the month before, limits kept. */
export async function getReview(db: Db, userId: string, month?: string, now = new Date()): Promise<MonthReview> {
  const m = month ?? addMonths(berlinMonth(now), -1);
  const { start, end } = monthBounds(m);
  await syncBills(db, userId, berlinToday(now));

  const [cats, spent, previous, incomeSum, savedSum, paidSum, biggest, counted, skipped] = await db.batch([
    db.select().from(categories).where(eq(categories.userId, userId)),
    spentPerCategory(db, userId, m),
    spentPerCategory(db, userId, addMonths(m, -1)),
    db
      .select({ total: sql<number>`coalesce(sum(${income.amountCents}), 0)` })
      .from(income)
      .where(and(eq(income.userId, userId), between(income.receivedOn, start, end))),
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
      .from(expenses)
      .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end)))
      .orderBy(desc(expenses.amountCents), desc(expenses.spentOn))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)` })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), between(expenses.spentOn, start, end))),
    db
      .select({ priceCents: wants.priceCents, decidedAt: wants.decidedAt })
      .from(wants)
      .where(and(eq(wants.userId, userId), eq(wants.status, "skipped"))),
  ]);

  const spentByCategory = byCategory(spent);
  const previousByCategory = byCategory(previous);
  const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  // decided_at is a UTC timestamp; count it in the Berlin month it happened in.
  const savedByWaitingCents = skipped
    .filter((w) => w.decidedAt && berlinMonth(new Date(w.decidedAt)) === m)
    .reduce((a, w) => a + w.priceCents, 0);

  return monthReview({
    month: m,
    totals: {
      incomeCents: Number(incomeSum[0]?.total ?? 0),
      expenseCents: total(spentByCategory),
      savedCents: Number(savedSum[0]?.total ?? 0),
      debtPaidCents: Number(paidSum[0]?.total ?? 0),
    },
    previousExpenseCents: total(previousByCategory),
    categories: cats,
    spentByCategory,
    previousByCategory,
    biggest: biggest[0] ?? null,
    savedByWaitingCents,
    expenseCount: Number(counted[0]?.n ?? 0),
  });
}

/**
 * For quick add: the expenses you log over and over in the last 90 days, and your notes
 * from the last year with the category each is used with most. Bills don't count.
 */
export async function getSuggestions(db: Db, userId: string, now = new Date()): Promise<MoneySuggestions> {
  const today = berlinToday(now);
  const recentFrom = addDays(today, -89);
  const [cats, rows] = await db.batch([
    db.select({ id: categories.id, name: categories.name, archived: categories.archived }).from(categories).where(eq(categories.userId, userId)),
    db
      .select({
        categoryId: expenses.categoryId,
        note: sql<string | null>`nullif(trim(${expenses.note}), '')`,
        amountCents: expenses.amountCents,
        count: sql<number>`count(*)`,
        recent: sql<number>`sum(case when ${expenses.spentOn} >= ${recentFrom} then 1 else 0 end)`,
        lastOn: sql<string>`max(${expenses.spentOn})`,
      })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), isNull(expenses.recurringBillId), gte(expenses.spentOn, addDays(today, -364))))
      .groupBy(expenses.categoryId, sql`lower(nullif(trim(${expenses.note}), ''))`, expenses.amountCents)
      .orderBy(desc(sql`count(*)`))
      .limit(500),
  ]);

  const live = new Map(cats.filter((c) => !c.archived).map((c) => [c.id, c.name]));
  const usable = rows.filter((r) => live.has(r.categoryId)).map((r) => ({ ...r, count: Number(r.count), recent: Number(r.recent) }));
  return {
    quickPicks: pickQuickPicks(usable.map((r) => ({ ...r, count: r.recent }))).map((p) => ({
      ...p,
      categoryName: live.get(p.categoryId)!,
    })),
    notes: noteSuggestions(usable).slice(0, 200),
  };
}
