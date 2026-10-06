import { eq, getTableColumns } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  categories,
  dayTasks,
  debtPayments,
  debts,
  expenses,
  habitChecks,
  habits,
  income,
  projects,
  recurringBills,
  savingsContributions,
  savingsGoals,
  settings,
  shippedEvents,
} from "../../../db/schema";
import type { ExportData } from "../../../shared/schemas";
import { nowIso } from "../../../shared/time";
import type { Db } from "../db";

// D1 allows 100 bound parameters per statement, so inserts are chunked.
const MAX_PARAMS = 100;

function insertChunked<T extends SQLiteTable>(db: Db, table: T, rows: T["$inferInsert"][]): BatchItem<"sqlite">[] {
  const columns = Object.keys(getTableColumns(table)).length;
  const size = Math.max(1, Math.floor(MAX_PARAMS / columns));
  const out: BatchItem<"sqlite">[] = [];
  for (let i = 0; i < rows.length; i += size) out.push(db.insert(table).values(rows.slice(i, i + size)));
  return out;
}

/** Drops the owner column so exports are portable between accounts. */
const strip = <T extends { userId: string }>(rows: T[]) => rows.map(({ userId: _owner, ...rest }) => rest);

export async function exportAll(db: Db, userId: string): Promise<ExportData> {
  const [p, e, s, cat, bill, exp, inc, goal, contrib, debt, pay, hab, chk, tsk] = await db.batch([
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(shippedEvents).where(eq(shippedEvents.userId, userId)),
    db.select().from(settings).where(eq(settings.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(recurringBills).where(eq(recurringBills.userId, userId)),
    db.select().from(expenses).where(eq(expenses.userId, userId)),
    db.select().from(income).where(eq(income.userId, userId)),
    db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)),
    db.select().from(savingsContributions).where(eq(savingsContributions.userId, userId)),
    db.select().from(debts).where(eq(debts.userId, userId)),
    db.select().from(debtPayments).where(eq(debtPayments.userId, userId)),
    db.select().from(habits).where(eq(habits.userId, userId)),
    db.select().from(habitChecks).where(eq(habitChecks.userId, userId)),
    db.select().from(dayTasks).where(eq(dayTasks.userId, userId)),
  ]);
  return {
    version: 3,
    exportedAt: nowIso(),
    projects: strip(p),
    shippedEvents: strip(e),
    settings: strip(s),
    money: {
      categories: strip(cat),
      recurringBills: strip(bill),
      expenses: strip(exp),
      income: strip(inc),
      savingsGoals: strip(goal),
      savingsContributions: strip(contrib),
      debts: strip(debt),
      debtPayments: strip(pay),
    },
    planner: { habits: strip(hab), habitChecks: strip(chk), dayTasks: strip(tsk) },
  };
}

/** Maps every id in the file to a fresh one, so an import can never collide with another account's rows. */
function idMapper() {
  const map = new Map<string, string>();
  return (old: string) => {
    let id = map.get(old);
    if (!id) {
      id = crypto.randomUUID();
      map.set(old, id);
    }
    return id;
  };
}

/**
 * Replaces the signed-in user's data in one D1 batch (one transaction: all or nothing).
 * Version 3 replaces everything. Version 2 leaves planner data untouched. Version 1 only has
 * projects, so money and planner are left untouched.
 * The schema check already guaranteed every reference points at a row in the file.
 */
export async function importAll(db: Db, userId: string, data: ExportData) {
  const id = idMapper();

  const statements: BatchItem<"sqlite">[] = [
    db.delete(shippedEvents).where(eq(shippedEvents.userId, userId)),
    db.delete(projects).where(eq(projects.userId, userId)),
    db.delete(settings).where(eq(settings.userId, userId)),
  ];
  if (data.version === 2 || data.version === 3) {
    // Children first so foreign keys never point at deleted rows.
    statements.push(
      db.delete(debtPayments).where(eq(debtPayments.userId, userId)),
      db.delete(savingsContributions).where(eq(savingsContributions.userId, userId)),
      db.delete(expenses).where(eq(expenses.userId, userId)),
      db.delete(recurringBills).where(eq(recurringBills.userId, userId)),
      db.delete(income).where(eq(income.userId, userId)),
      db.delete(debts).where(eq(debts.userId, userId)),
      db.delete(savingsGoals).where(eq(savingsGoals.userId, userId)),
      db.delete(categories).where(eq(categories.userId, userId)),
    );
  }
  if (data.version === 3) {
    statements.push(
      db.delete(habitChecks).where(eq(habitChecks.userId, userId)),
      db.delete(dayTasks).where(eq(dayTasks.userId, userId)),
      db.delete(habits).where(eq(habits.userId, userId)),
    );
  }

  statements.push(
    ...insertChunked(db, projects, data.projects.map((r) => ({ ...r, id: id(r.id), userId }))),
    ...insertChunked(db, shippedEvents, data.shippedEvents.map((r) => ({ ...r, id: id(r.id), projectId: id(r.projectId), userId }))),
    ...insertChunked(db, settings, data.settings.map((r) => ({ ...r, userId }))),
  );

  if (data.version === 2 || data.version === 3) {
    const m = data.money;
    statements.push(
      ...insertChunked(db, categories, m.categories.map((r) => ({ ...r, id: id(r.id), userId }))),
      ...insertChunked(db, recurringBills, m.recurringBills.map((r) => ({ ...r, id: id(r.id), categoryId: id(r.categoryId), userId }))),
      ...insertChunked(
        db,
        expenses,
        m.expenses.map((r) => ({
          ...r,
          id: id(r.id),
          categoryId: id(r.categoryId),
          recurringBillId: r.recurringBillId ? id(r.recurringBillId) : null,
          userId,
        })),
      ),
      ...insertChunked(db, income, m.income.map((r) => ({ ...r, id: id(r.id), userId }))),
      ...insertChunked(db, savingsGoals, m.savingsGoals.map((r) => ({ ...r, id: id(r.id), userId }))),
      ...insertChunked(db, savingsContributions, m.savingsContributions.map((r) => ({ ...r, id: id(r.id), goalId: id(r.goalId), userId }))),
      ...insertChunked(db, debts, m.debts.map((r) => ({ ...r, id: id(r.id), userId }))),
      ...insertChunked(db, debtPayments, m.debtPayments.map((r) => ({ ...r, id: id(r.id), debtId: id(r.debtId), userId }))),
    );
  }
  if (data.version === 3) {
    const p = data.planner;
    statements.push(
      ...insertChunked(db, habits, p.habits.map((r) => ({ ...r, id: id(r.id), userId }))),
      ...insertChunked(db, habitChecks, p.habitChecks.map((r) => ({ ...r, habitId: id(r.habitId), userId }))),
      ...insertChunked(db, dayTasks, p.dayTasks.map((r) => ({ ...r, id: id(r.id), userId }))),
    );
  }

  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return {
    projects: data.projects.length,
    shippedEvents: data.shippedEvents.length,
    settings: data.settings.length,
    ...((data.version === 2 || data.version === 3) && { expenses: data.money.expenses.length, bills: data.money.recurringBills.length }),
    ...(data.version === 3 && { habits: data.planner.habits.length, habitChecks: data.planner.habitChecks.length }),
  };
}
