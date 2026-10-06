import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { barState, berlinMonth, categoryLeft, monthTotals } from "@shared/money";
import type {
  ContributionCreate,
  ExpenseCreate,
  ExpenseItem,
  ExpenseUpdate,
  IncomeCreate,
  MoneyOverview,
  PaymentCreate,
} from "@shared/money-schemas";
import { moneyApi } from "@/lib/money-api";

export const moneyKeys = {
  all: ["money"] as const,
  overview: (month: string) => ["money", "overview", month] as const,
  charts: (month: string) => ["money", "charts", month] as const,
  expenses: (month: string) => ["money", "expenses", month] as const,
  categories: ["money", "categories"] as const,
  bills: ["money", "bills"] as const,
  wants: ["money", "wants"] as const,
};

export function useOverview(month: string, enabled = true) {
  return useQuery({
    queryKey: moneyKeys.overview(month),
    queryFn: () => moneyApi.overview(month),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCharts(month: string) {
  return useQuery({
    queryKey: moneyKeys.charts(month),
    queryFn: () => moneyApi.charts(month),
    placeholderData: keepPreviousData,
  });
}

export function useMonthExpenses(month: string, enabled: boolean) {
  return useQuery({ queryKey: moneyKeys.expenses(month), queryFn: () => moneyApi.expenses(month), enabled });
}

export function useCategories() {
  return useQuery({ queryKey: moneyKeys.categories, queryFn: moneyApi.categories });
}

export function useWants(enabled = true) {
  return useQuery({ queryKey: moneyKeys.wants, queryFn: moneyApi.wants, enabled });
}

export function useBills() {
  return useQuery({ queryKey: moneyKeys.bills, queryFn: moneyApi.bills });
}

const monthOf = (date: string) => date.slice(0, 7);

/** Recomputes totals and category numbers after a local change, using the shared rules. */
function recompute(o: MoneyOverview, change: Partial<MoneyOverview["totals"]> & { categoryId?: string; spentDelta?: number }) {
  const totals = monthTotals({
    incomeCents: change.incomeCents ?? o.totals.incomeCents,
    expenseCents: change.expenseCents ?? o.totals.expenseCents,
    savedCents: change.savedCents ?? o.totals.savedCents,
    debtPaidCents: change.debtPaidCents ?? o.totals.debtPaidCents,
  });
  const categories = o.categories.map((c) => {
    if (c.id !== change.categoryId || !change.spentDelta) return c;
    const spentCents = c.spentCents + change.spentDelta;
    return {
      ...c,
      spentCents,
      leftCents: categoryLeft({ limitCents: c.monthlyLimitCents, spentCents, upcomingCents: c.upcomingCents }),
      state: barState(c.monthlyLimitCents, spentCents + c.upcomingCents),
    };
  });
  return { ...o, totals, categories };
}

/** Runs an optimistic edit on one month's overview and returns the rollback. */
async function optimistic(qc: QueryClient, month: string, edit: (o: MoneyOverview) => MoneyOverview) {
  const key = moneyKeys.overview(month);
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<MoneyOverview>(key);
  if (previous) qc.setQueryData(key, edit(previous));
  return () => qc.setQueryData(key, previous);
}

function useMoneyMutation<V>(
  mutationFn: (v: V) => Promise<unknown>,
  opts: { month?: (v: V) => string; edit?: (o: MoneyOverview, v: V) => MoneyOverview; success?: string } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (v: V) => {
      if (!opts.edit) return {};
      return { rollback: await optimistic(qc, opts.month?.(v) ?? berlinMonth(), (o) => opts.edit!(o, v)) };
    },
    onError: (err, _v, ctx) => {
      ctx?.rollback?.();
      toast.error(err.message);
    },
    onSuccess: () => {
      if (opts.success) toast.success(opts.success);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  });
}

export function useAddExpense() {
  return useMoneyMutation((input: ExpenseCreate & { categoryName: string }) => moneyApi.createExpense(input), {
    month: (v) => monthOf(v.spentOn),
    edit: (o, v) => {
      const item: ExpenseItem = {
        id: `temp-${crypto.randomUUID()}`,
        categoryId: v.categoryId,
        categoryName: v.categoryName,
        amountCents: v.amountCents,
        spentOn: v.spentOn,
        note: v.note ?? null,
        recurringBillId: null,
        createdAt: new Date().toISOString(),
      };
      const next = recompute(o, {
        expenseCents: o.totals.expenseCents + v.amountCents,
        categoryId: v.categoryId,
        spentDelta: v.amountCents,
      });
      const recent = [item, ...o.recentExpenses].sort((a, b) => b.spentOn.localeCompare(a.spentOn)).slice(0, 10);
      return { ...next, recentExpenses: recent, expenseCount: o.expenseCount + 1 };
    },
  });
}

export function useUpdateExpense() {
  return useMoneyMutation(
    ({ id, patch }: { id: string; patch: ExpenseUpdate; month: string }) => moneyApi.updateExpense(id, patch),
    { success: "Expense updated" },
  );
}

export function useDeleteExpense() {
  return useMoneyMutation(({ expense }: { expense: ExpenseItem }) => moneyApi.deleteExpense(expense.id), {
    month: (v) => monthOf(v.expense.spentOn),
    edit: (o, { expense }) => ({
      ...recompute(o, {
        expenseCents: o.totals.expenseCents - expense.amountCents,
        categoryId: expense.categoryId,
        spentDelta: -expense.amountCents,
      }),
      recentExpenses: o.recentExpenses.filter((e) => e.id !== expense.id),
      expenseCount: o.expenseCount - 1,
    }),
    success: "Expense deleted",
  });
}

export function useAddIncome() {
  return useMoneyMutation((input: IncomeCreate) => moneyApi.createIncome(input), {
    month: (v) => monthOf(v.receivedOn),
    edit: (o, v) => recompute(o, { incomeCents: o.totals.incomeCents + v.amountCents }),
    success: "Income added",
  });
}

export function useDeleteIncome() {
  return useMoneyMutation((id: string) => moneyApi.deleteIncome(id), { success: "Income deleted" });
}

export function useAddContribution() {
  return useMoneyMutation(
    ({ goalId, input }: { goalId: string; input: ContributionCreate }) => moneyApi.addContribution(goalId, input),
    {
      month: (v) => monthOf(v.input.onDate),
      edit: (o, { goalId, input }) => ({
        ...recompute(o, { savedCents: o.totals.savedCents + input.amountCents }),
        goals: o.goals.map((g) => (g.id === goalId ? { ...g, savedCents: g.savedCents + input.amountCents } : g)),
      }),
    },
  );
}

export function useAddPayment() {
  return useMoneyMutation(
    ({ debtId, input }: { debtId: string; input: PaymentCreate }) => moneyApi.addPayment(debtId, input),
    {
      month: (v) => monthOf(v.input.paidOn),
      edit: (o, { debtId, input }) => ({
        ...recompute(o, { debtPaidCents: o.totals.debtPaidCents + input.amountCents }),
        debts: o.debts.map((d) =>
          d.id === debtId
            ? { ...d, paidCents: d.paidCents + input.amountCents, balanceCents: Math.max(0, d.balanceCents - input.amountCents) }
            : d,
        ),
      }),
    },
  );
}

/** For the manage dialogs: no optimistic edit, just refresh everything money-related. */
export function useMoneyAction<V>(fn: (v: V) => Promise<unknown>, success?: string) {
  return useMoneyMutation(fn, { success });
}
