import { and, count, eq, max } from "drizzle-orm";
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
import { berlinToday } from "../../../../shared/money";
import type {
  BillCreate,
  BillUpdate,
  CategoryCreate,
  CategoryUpdate,
  ContributionCreate,
  DebtCreate,
  DebtUpdate,
  ExpenseCreate,
  ExpenseUpdate,
  GoalCreate,
  GoalUpdate,
  IncomeCreate,
  IncomeUpdate,
  PaymentCreate,
} from "../../../../shared/money-schemas";
import { normalizeName } from "../../../../shared/rules";
import { nowIso } from "../../../../shared/time";
import type { Db } from "../../db";
import { ApiError, notFound } from "../../errors";

// Every function takes the signed-in user's id. Lookups match on (id, user_id), so another
// user's id behaves exactly like an id that doesn't exist: 404.

const newId = () => crypto.randomUUID();
const isEmpty = (o: object) => Object.keys(o).length === 0;

// ---- Categories -------------------------------------------------------------

export const listCategories = (db: Db, userId: string) =>
  db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.sortOrder, categories.name);

async function getCategory(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .get();
  if (!row) throw notFound("Category");
  return row;
}

async function assertCategoryNameFree(db: Db, userId: string, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));
  const clash = rows.find((r) => r.id !== exceptId && normalizeName(r.name) === normalizeName(name));
  if (clash) throw new ApiError(409, "name_taken", `A category named "${clash.name}" already exists`);
}

export async function createCategory(db: Db, userId: string, input: CategoryCreate) {
  await assertCategoryNameFree(db, userId, input.name);
  const top = await db.select({ n: max(categories.sortOrder) }).from(categories).where(eq(categories.userId, userId)).get();
  const row = {
    id: newId(),
    userId,
    name: input.name,
    monthlyLimitCents: input.monthlyLimitCents ?? null,
    sortOrder: (top?.n ?? -1) + 1,
    archived: false,
    createdAt: nowIso(),
  };
  await db.insert(categories).values(row);
  return row;
}

export async function updateCategory(db: Db, userId: string, id: string, patch: CategoryUpdate) {
  await getCategory(db, userId, id);
  if (patch.name !== undefined) await assertCategoryNameFree(db, userId, patch.name, id);
  if (isEmpty(patch)) return getCategory(db, userId, id);
  return db
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning()
    .get();
}

export async function deleteCategory(db: Db, userId: string, id: string) {
  const cat = await getCategory(db, userId, id);
  const [used, billed] = await db.batch([
    db.select({ n: count() }).from(expenses).where(eq(expenses.categoryId, id)),
    db.select({ n: count() }).from(recurringBills).where(eq(recurringBills.categoryId, id)),
  ]);
  if ((used[0]?.n ?? 0) > 0 || (billed[0]?.n ?? 0) > 0) {
    throw new ApiError(
      409,
      "category_in_use",
      `${cat.name} has expenses or bills, so it can't be deleted. Archive it instead to hide it.`,
    );
  }
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

// ---- Expenses ---------------------------------------------------------------

async function getExpense(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .get();
  if (!row) throw notFound("Expense");
  return row;
}

export async function createExpense(db: Db, userId: string, input: ExpenseCreate) {
  await getCategory(db, userId, input.categoryId);
  const row = {
    id: newId(),
    userId,
    categoryId: input.categoryId,
    amountCents: input.amountCents,
    spentOn: input.spentOn,
    note: input.note || null,
    recurringBillId: null,
    createdAt: nowIso(),
  };
  await db.insert(expenses).values(row);
  return row;
}

export async function updateExpense(db: Db, userId: string, id: string, patch: ExpenseUpdate) {
  await getExpense(db, userId, id);
  if (patch.categoryId) await getCategory(db, userId, patch.categoryId);
  if (isEmpty(patch)) return getExpense(db, userId, id);
  return db
    .update(expenses)
    .set({ ...patch, note: patch.note === undefined ? undefined : patch.note || null })
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning()
    .get();
}

export async function deleteExpense(db: Db, userId: string, id: string) {
  await getExpense(db, userId, id);
  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
}

// ---- Recurring bills --------------------------------------------------------

export const listBills = (db: Db, userId: string) =>
  db
    .select()
    .from(recurringBills)
    .where(eq(recurringBills.userId, userId))
    .orderBy(recurringBills.dayOfMonth, recurringBills.name);

async function getBill(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(recurringBills)
    .where(and(eq(recurringBills.id, id), eq(recurringBills.userId, userId)))
    .get();
  if (!row) throw notFound("Bill");
  return row;
}

export async function createBill(db: Db, userId: string, input: BillCreate) {
  await getCategory(db, userId, input.categoryId);
  const row = {
    id: newId(),
    userId,
    name: input.name,
    categoryId: input.categoryId,
    amountCents: input.amountCents,
    dayOfMonth: input.dayOfMonth,
    startsOn: input.startsOn ?? berlinToday(),
    loggedThrough: null,
    active: true,
    createdAt: nowIso(),
  };
  await db.insert(recurringBills).values(row);
  return row;
}

/** Changes apply to future due dates only; already-logged expenses keep their amount. */
export async function updateBill(db: Db, userId: string, id: string, patch: BillUpdate) {
  await getBill(db, userId, id);
  if (patch.categoryId) await getCategory(db, userId, patch.categoryId);
  if (isEmpty(patch)) return getBill(db, userId, id);
  return db
    .update(recurringBills)
    .set(patch)
    .where(and(eq(recurringBills.id, id), eq(recurringBills.userId, userId)))
    .returning()
    .get();
}

/** Stops the bill. Expenses it already logged stay. */
export async function deactivateBill(db: Db, userId: string, id: string) {
  await getBill(db, userId, id);
  return db
    .update(recurringBills)
    .set({ active: false })
    .where(and(eq(recurringBills.id, id), eq(recurringBills.userId, userId)))
    .returning()
    .get();
}

// ---- Income -----------------------------------------------------------------

async function getIncome(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(income)
    .where(and(eq(income.id, id), eq(income.userId, userId)))
    .get();
  if (!row) throw notFound("Income");
  return row;
}

export async function createIncome(db: Db, userId: string, input: IncomeCreate) {
  const row = { id: newId(), userId, ...input, note: input.note || null, createdAt: nowIso() };
  await db.insert(income).values(row);
  return row;
}

export async function updateIncome(db: Db, userId: string, id: string, patch: IncomeUpdate) {
  await getIncome(db, userId, id);
  if (isEmpty(patch)) return getIncome(db, userId, id);
  return db
    .update(income)
    .set({ ...patch, note: patch.note === undefined ? undefined : patch.note || null })
    .where(and(eq(income.id, id), eq(income.userId, userId)))
    .returning()
    .get();
}

export async function deleteIncome(db: Db, userId: string, id: string) {
  await getIncome(db, userId, id);
  await db.delete(income).where(and(eq(income.id, id), eq(income.userId, userId)));
}

// ---- Savings goals ----------------------------------------------------------

export const listGoals = (db: Db, userId: string) =>
  db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)).orderBy(savingsGoals.createdAt);

async function getGoal(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .get();
  if (!row) throw notFound("Savings goal");
  return row;
}

export async function createGoal(db: Db, userId: string, input: GoalCreate) {
  const row = {
    id: newId(),
    userId,
    name: input.name,
    targetCents: input.targetCents,
    targetDate: input.targetDate ?? null,
    archived: false,
    createdAt: nowIso(),
  };
  await db.insert(savingsGoals).values(row);
  return row;
}

export async function updateGoal(db: Db, userId: string, id: string, patch: GoalUpdate) {
  await getGoal(db, userId, id);
  if (isEmpty(patch)) return getGoal(db, userId, id);
  return db
    .update(savingsGoals)
    .set(patch)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .returning()
    .get();
}

export async function deleteGoal(db: Db, userId: string, id: string) {
  await getGoal(db, userId, id);
  await db.delete(savingsGoals).where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)));
}

export async function addContribution(db: Db, userId: string, goalId: string, input: ContributionCreate) {
  await getGoal(db, userId, goalId);
  const row = { id: newId(), userId, goalId, amountCents: input.amountCents, onDate: input.onDate, note: input.note || null };
  await db.insert(savingsContributions).values(row);
  return row;
}

export async function deleteContribution(db: Db, userId: string, id: string) {
  const row = await db
    .delete(savingsContributions)
    .where(and(eq(savingsContributions.id, id), eq(savingsContributions.userId, userId)))
    .returning({ id: savingsContributions.id })
    .get();
  if (!row) throw notFound("Contribution");
}

// ---- Debts ------------------------------------------------------------------

export const listDebts = (db: Db, userId: string) =>
  db.select().from(debts).where(eq(debts.userId, userId)).orderBy(debts.createdAt);

async function getDebt(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .get();
  if (!row) throw notFound("Debt");
  return row;
}

export async function createDebt(db: Db, userId: string, input: DebtCreate) {
  const row = { id: newId(), userId, ...input, archived: false, createdAt: nowIso() };
  await db.insert(debts).values(row);
  return row;
}

export async function updateDebt(db: Db, userId: string, id: string, patch: DebtUpdate) {
  await getDebt(db, userId, id);
  if (isEmpty(patch)) return getDebt(db, userId, id);
  return db
    .update(debts)
    .set(patch)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .returning()
    .get();
}

export async function deleteDebt(db: Db, userId: string, id: string) {
  await getDebt(db, userId, id);
  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.userId, userId)));
}

export async function addPayment(db: Db, userId: string, debtId: string, input: PaymentCreate) {
  await getDebt(db, userId, debtId);
  const row = { id: newId(), userId, debtId, amountCents: input.amountCents, paidOn: input.paidOn, note: input.note || null };
  await db.insert(debtPayments).values(row);
  return row;
}

export async function deletePayment(db: Db, userId: string, id: string) {
  const row = await db
    .delete(debtPayments)
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, userId)))
    .returning({ id: debtPayments.id })
    .get();
  if (!row) throw notFound("Payment");
}
