import { z } from "zod";
import { MAX_AMOUNT_CENTS, eurosToCents, type BarState, type NoteSuggestion, type PacePoint, type QuickPick } from "./money";

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-06")
  .refine(isRealDate, "Not a real calendar date");
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-10");

const amount = z.number().int("Amount must be whole cents").positive("Amount must be more than 0").max(MAX_AMOUNT_CENTS);
const name = z.string().trim().min(1, "Name is required").max(80);
const note = z.string().trim().max(500).nullable().optional();
const id = z.string().min(1);

export const monthQuerySchema = z.object({ month: monthSchema.optional() });

// ---- Inputs ---------------------------------------------------------------

export const categoryCreateSchema = z.object({
  name,
  monthlyLimitCents: amount.nullable().optional(),
});
export const categoryUpdateSchema = z
  .object({ name, monthlyLimitCents: amount.nullable(), sortOrder: z.number().int().min(0), archived: z.boolean() })
  .partial()
  .strict();

export const expenseCreateSchema = z.object({ categoryId: id, amountCents: amount, spentOn: dateSchema, note });
export const expenseUpdateSchema = expenseCreateSchema.partial().strict();

const AMOUNT_MESSAGE = "Amount must be euros from 0.01 to 100000, with at most 2 decimals";

/** Euros from a voice agent: 12.4, "12.40" or "12,40". Always comes out as a number of euros. */
export const agentAmountSchema = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^\d+([.,]\d{1,2})?$/, AMOUNT_MESSAGE)
      .transform((s) => Number(s.replace(",", "."))),
  ])
  .refine((n) => eurosToCents(n) !== null, AMOUNT_MESSAGE);

const wantName = z.string().trim().min(1, "Name is required").max(120);
const url = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\//, "Links must start with http:// or https://");

export const wantCreateSchema = z.object({ name: wantName, priceCents: amount, url: url.nullable().optional() });
export const wantBuySchema = z.object({ categoryId: id, spentOn: dateSchema.optional(), priceCents: amount.optional() });
export const agentWantCreateSchema = z.object({ name: wantName, amount: agentAmountSchema });
export const agentWantNameSchema = z.object({ name: wantName });
export const agentWantBuySchema = z.object({
  name: wantName,
  category: z.string().trim().min(1).max(80),
  amount: agentAmountSchema.optional(),
});

export type WantCreate = z.infer<typeof wantCreateSchema>;
export type WantBuy = z.infer<typeof wantBuySchema>;
export type WantRow = {
  id: string;
  name: string;
  priceCents: number;
  url: string | null;
  createdAt: string;
  readyAt: string;
  status: "waiting" | "bought" | "skipped";
  decidedAt: string | null;
  expenseId: string | null;
};
export type WantsView = { waiting: WantRow[]; decided: WantRow[]; savedCents: number };

/** Voice agents speak euros, not cents: { category: "Food", amount: 12.4 }. */
export const agentExpenseCreateSchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(80),
  amount: agentAmountSchema,
  spentOn: dateSchema.optional(),
  note,
});

export const billCreateSchema = z.object({
  name,
  categoryId: id,
  amountCents: amount,
  dayOfMonth: z.number().int().min(1).max(31),
  startsOn: dateSchema.optional(),
});
export const billUpdateSchema = z
  .object({ name, categoryId: id, amountCents: amount, dayOfMonth: z.number().int().min(1).max(31), active: z.boolean() })
  .partial()
  .strict();

export const incomeCreateSchema = z.object({ amountCents: amount, source: name, receivedOn: dateSchema, note });
export const incomeUpdateSchema = incomeCreateSchema.partial().strict();

export const goalCreateSchema = z.object({ name, targetCents: amount, targetDate: dateSchema.nullable().optional() });
export const goalUpdateSchema = z
  .object({ name, targetCents: amount, targetDate: dateSchema.nullable(), archived: z.boolean() })
  .partial()
  .strict();

export const contributionCreateSchema = z.object({
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0 && Math.abs(n) <= MAX_AMOUNT_CENTS, "Amount must not be 0"),
  onDate: dateSchema,
  note,
});

export const debtCreateSchema = z.object({ name, startingBalanceCents: amount, startedOn: dateSchema });
export const debtUpdateSchema = z
  .object({ name, startingBalanceCents: amount, startedOn: dateSchema, archived: z.boolean() })
  .partial()
  .strict();

export const paymentCreateSchema = z.object({ amountCents: amount, paidOn: dateSchema, note });

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type ExpenseCreate = z.infer<typeof expenseCreateSchema>;
export type AgentExpenseCreate = z.infer<typeof agentExpenseCreateSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
export type BillCreate = z.infer<typeof billCreateSchema>;
export type BillUpdate = z.infer<typeof billUpdateSchema>;
export type IncomeCreate = z.infer<typeof incomeCreateSchema>;
export type IncomeUpdate = z.infer<typeof incomeUpdateSchema>;
export type GoalCreate = z.infer<typeof goalCreateSchema>;
export type GoalUpdate = z.infer<typeof goalUpdateSchema>;
export type ContributionCreate = z.infer<typeof contributionCreateSchema>;
export type DebtCreate = z.infer<typeof debtCreateSchema>;
export type DebtUpdate = z.infer<typeof debtUpdateSchema>;
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;

// ---- Stored rows (also the export format) ---------------------------------

const ts = z.iso.datetime({ offset: true });

export const categoryRowSchema = z.object({
  id,
  name,
  monthlyLimitCents: amount.nullable(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
  createdAt: ts,
});
export const billRowSchema = z.object({
  id,
  name,
  categoryId: id,
  amountCents: amount,
  dayOfMonth: z.number().int().min(1).max(31),
  startsOn: dateSchema,
  loggedThrough: dateSchema.nullable(),
  active: z.boolean(),
  createdAt: ts,
});
export const expenseRowSchema = z.object({
  id,
  categoryId: id,
  amountCents: amount,
  spentOn: dateSchema,
  note: z.string().nullable(),
  recurringBillId: z.string().nullable(),
  createdAt: ts,
});
export const incomeRowSchema = z.object({
  id,
  amountCents: amount,
  source: name,
  receivedOn: dateSchema,
  note: z.string().nullable(),
  createdAt: ts,
});
export const goalRowSchema = z.object({
  id,
  name,
  targetCents: amount,
  targetDate: dateSchema.nullable(),
  archived: z.boolean(),
  createdAt: ts,
});
export const contributionRowSchema = z.object({
  id,
  goalId: id,
  amountCents: z.number().int(),
  onDate: dateSchema,
  note: z.string().nullable(),
});
export const debtRowSchema = z.object({
  id,
  name,
  startingBalanceCents: amount,
  startedOn: dateSchema,
  archived: z.boolean(),
  createdAt: ts,
});
export const paymentRowSchema = z.object({
  id,
  debtId: id,
  amountCents: amount,
  paidOn: dateSchema,
  note: z.string().nullable(),
});

export const wantRowSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  priceCents: amount,
  url: z.string().max(500).nullable(),
  createdAt: ts,
  readyAt: ts,
  status: z.enum(["waiting", "bought", "skipped"]),
  decidedAt: ts.nullable(),
  expenseId: z.string().nullable(),
});

export const moneyExportSchema = z.object({
  categories: z.array(categoryRowSchema),
  recurringBills: z.array(billRowSchema),
  expenses: z.array(expenseRowSchema),
  income: z.array(incomeRowSchema),
  savingsGoals: z.array(goalRowSchema),
  savingsContributions: z.array(contributionRowSchema),
  debts: z.array(debtRowSchema),
  debtPayments: z.array(paymentRowSchema),
  // Optional so files exported before the want list existed still import.
  wants: z.array(wantRowSchema).optional(),
});
export type MoneyExport = z.infer<typeof moneyExportSchema>;

export type CategoryRow = z.infer<typeof categoryRowSchema>;
export type BillRow = z.infer<typeof billRowSchema>;
export type ExpenseRow = z.infer<typeof expenseRowSchema>;
export type IncomeRow = z.infer<typeof incomeRowSchema>;
export type GoalRow = z.infer<typeof goalRowSchema>;
export type DebtRow = z.infer<typeof debtRowSchema>;
export type ContributionRow = z.infer<typeof contributionRowSchema>;
export type PaymentRow = z.infer<typeof paymentRowSchema>;

// ---- Responses ------------------------------------------------------------

export type CategorySummary = CategoryRow & {
  spentCents: number;
  upcomingCents: number;
  leftCents: number | null;
  state: BarState;
};

export type BillThisMonth = {
  id: string;
  name: string;
  categoryId: string;
  amountCents: number;
  dueOn: string;
  status: "logged" | "upcoming";
};

export type ExpenseItem = ExpenseRow & { categoryName: string };

export type GoalSummary = GoalRow & { savedCents: number };
export type DebtSummary = DebtRow & { paidCents: number; balanceCents: number };

export type MoneyOverview = {
  month: string;
  today: string;
  isCurrentMonth: boolean;
  totals: { incomeCents: number; expenseCents: number; savedCents: number; debtPaidCents: number; leftCents: number };
  categories: CategorySummary[];
  bills: BillThisMonth[];
  nextBill: BillThisMonth | null;
  recentExpenses: ExpenseItem[];
  expenseCount: number;
  income: IncomeRow[];
  goals: GoalSummary[];
  debts: DebtSummary[];
};

export type MoneyCharts = {
  month: string;
  pace: PacePoint[];
  hasBudget: boolean;
  byCategory: { categoryId: string; name: string; spentCents: number }[];
  months: { month: string; incomeCents: number; expenseCents: number }[];
  debts: { id: string; name: string; points: { date: string; balanceCents: number }[] }[];
};

export type MoneyLeft = {
  month: string;
  leftCents: number;
  categories: { name: string; leftCents: number }[];
  speech: string;
};

export type MoneySuggestions = {
  quickPicks: (QuickPick & { categoryName: string })[];
  notes: NoteSuggestion[];
};
