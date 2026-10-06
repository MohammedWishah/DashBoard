import { useCallback, useSyncExternalStore } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { barState, berlinMonth, categoryLeft, formatEuro, monthTotals } from "@shared/money";
import type {
  ContributionCreate,
  ExpenseCreate,
  ExpenseItem,
  ExpenseUpdate,
  IncomeCreate,
  IncomeRow,
  IncomeUpdate,
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
  review: (month: string) => ["money", "review", month] as const,
  suggestions: ["money", "suggestions"] as const,
  goalHistory: (id: string) => ["money", "goal-history", id] as const,
  debtHistory: (id: string) => ["money", "debt-history", id] as const,
};

// ---- Deletes with Undo ------------------------------------------------------
// A delete waits 5 seconds before reaching the server so Undo can cancel it. Until the
// server confirms and the refetch lands, the item is subtracted from what's on screen.

export type PendingDelete = { kind: "expense"; item: ExpenseItem } | { kind: "income"; item: IncomeRow };

const pending = new Map<string, PendingDelete>();
let pendingVersion = 0;
const listeners = new Set<() => void>();
function notify() {
  pendingVersion++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const usePendingVersion = () => useSyncExternalStore(subscribe, () => pendingVersion);

const monthOfPending = (p: PendingDelete) => (p.kind === "expense" ? p.item.spentOn : p.item.receivedOn).slice(0, 7);

function withoutPending(o: MoneyOverview): MoneyOverview {
  let next = o;
  for (const p of pending.values()) {
    if (monthOfPending(p) !== o.month) continue;
    if (p.kind === "expense") {
      next = {
        ...recompute(next, {
          expenseCents: next.totals.expenseCents - p.item.amountCents,
          categoryId: p.item.categoryId,
          spentDelta: -p.item.amountCents,
        }),
        recentExpenses: next.recentExpenses.filter((e) => e.id !== p.item.id),
        expenseCount: next.expenseCount - 1,
      };
    } else {
      next = { ...recompute(next, { incomeCents: next.totals.incomeCents - p.item.amountCents }), income: next.income.filter((i) => i.id !== p.item.id) };
    }
  }
  return next;
}

export function useDeleteWithUndo() {
  const qc = useQueryClient();
  return (p: PendingDelete) => {
    const id = p.item.id;
    pending.set(id, p);
    notify();
    const label = p.kind === "expense" ? `${formatEuro(p.item.amountCents)} ${p.item.note || p.item.categoryName}` : `${formatEuro(p.item.amountCents)} from ${p.item.source}`;
    const timer = setTimeout(async () => {
      try {
        await (p.kind === "expense" ? moneyApi.deleteExpense(id) : moneyApi.deleteIncome(id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete");
      } finally {
        await qc.invalidateQueries({ queryKey: moneyKeys.all });
        pending.delete(id);
        notify();
      }
    }, 5000);
    toast(`Deleted ${label}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          pending.delete(id);
          notify();
        },
      },
    });
  };
}

export function useOverview(month: string, enabled = true) {
  const version = usePendingVersion();
  // Re-run select whenever the pending deletes change.
  const select = useCallback(withoutPending, [version]);
  return useQuery({
    queryKey: moneyKeys.overview(month),
    queryFn: () => moneyApi.overview(month),
    placeholderData: keepPreviousData,
    select,
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
  const version = usePendingVersion();
  // Re-run select whenever the pending deletes change.
  const select = useCallback((rows: ExpenseItem[]) => rows.filter((e) => !pending.has(e.id)), [version]);
  return useQuery({ queryKey: moneyKeys.expenses(month), queryFn: () => moneyApi.expenses(month), enabled, select });
}

export function useReview(month: string, enabled = true) {
  return useQuery({ queryKey: moneyKeys.review(month), queryFn: () => moneyApi.review(month), enabled });
}

export function useSuggestions() {
  return useQuery({ queryKey: moneyKeys.suggestions, queryFn: moneyApi.suggestions, staleTime: 5 * 60_000 });
}

export function useGoalHistory(goalId: string) {
  return useQuery({ queryKey: moneyKeys.goalHistory(goalId), queryFn: () => moneyApi.contributions(goalId) });
}

export function useDebtHistory(debtId: string) {
  return useQuery({ queryKey: moneyKeys.debtHistory(debtId), queryFn: () => moneyApi.payments(debtId) });
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

function useMoneyMutation<V, R = unknown>(
  mutationFn: (v: V) => Promise<R>,
  opts: {
    month?: (v: V) => string;
    edit?: (o: MoneyOverview, v: V) => MoneyOverview;
    success?: string;
    /** Runs even after the component that started it unmounts, unlike callbacks passed to mutate(). */
    onSuccess?: (data: R, v: V) => void;
  } = {},
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
    onSuccess: (data: R, v: V) => {
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data, v);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMoneyMutation((input: ExpenseCreate & { categoryName: string }) => moneyApi.createExpense(input), {
    onSuccess: (row, v) =>
      toast.success(`${formatEuro(v.amountCents)} ${v.note || v.categoryName} added`, {
        action: {
          label: "Undo",
          onClick: () =>
            moneyApi.deleteExpense(row.id).then(
              () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
              (err: Error) => toast.error(err.message),
            ),
        },
      }),
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

export function useAddIncome() {
  return useMoneyMutation((input: IncomeCreate) => moneyApi.createIncome(input), {
    month: (v) => monthOf(v.receivedOn),
    edit: (o, v) => recompute(o, { incomeCents: o.totals.incomeCents + v.amountCents }),
    success: "Income added",
  });
}

export function useUpdateIncome() {
  return useMoneyMutation(({ id, patch }: { id: string; patch: IncomeUpdate }) => moneyApi.updateIncome(id, patch), {
    success: "Income updated",
  });
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

/** Runs a money API call outside any component's lifetime (for Undo buttons in toasts), then refreshes. */
export function useMoneyUndo() {
  const qc = useQueryClient();
  return (run: () => Promise<unknown>) =>
    run().then(
      () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
      (err: Error) => toast.error(err.message),
    );
}
