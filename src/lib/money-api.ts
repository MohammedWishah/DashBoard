import type {
  BillCreate,
  BillRow,
  BillUpdate,
  CategoryCreate,
  CategoryRow,
  CategoryUpdate,
  ContributionCreate,
  DebtCreate,
  DebtRow,
  ExpenseCreate,
  ExpenseItem,
  ExpenseRow,
  ExpenseUpdate,
  GoalCreate,
  GoalRow,
  IncomeCreate,
  IncomeRow,
  MoneyCharts,
  MoneyOverview,
  PaymentCreate,
} from "@shared/money-schemas";
import { request } from "@/lib/api";

const json = (data: unknown) => JSON.stringify(data);
const q = (month?: string) => (month ? `?month=${month}` : "");

export const moneyApi = {
  overview: (month?: string) => request<MoneyOverview>(`/money/overview${q(month)}`),
  charts: (month?: string) => request<MoneyCharts>(`/money/charts${q(month)}`),
  expenses: (month?: string) => request<{ expenses: ExpenseItem[] }>(`/money/expenses${q(month)}`).then((r) => r.expenses),

  createExpense: (input: ExpenseCreate) =>
    request<{ expense: ExpenseRow }>("/money/expenses", { method: "POST", body: json(input) }).then((r) => r.expense),
  updateExpense: (id: string, patch: ExpenseUpdate) =>
    request<{ expense: ExpenseRow }>(`/money/expenses/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.expense),
  deleteExpense: (id: string) => request<{ ok: true }>(`/money/expenses/${id}`, { method: "DELETE" }),

  createIncome: (input: IncomeCreate) =>
    request<{ income: IncomeRow }>("/money/income", { method: "POST", body: json(input) }).then((r) => r.income),
  deleteIncome: (id: string) => request<{ ok: true }>(`/money/income/${id}`, { method: "DELETE" }),

  categories: () => request<{ categories: CategoryRow[] }>("/money/categories").then((r) => r.categories),
  createCategory: (input: CategoryCreate) =>
    request<{ category: CategoryRow }>("/money/categories", { method: "POST", body: json(input) }).then((r) => r.category),
  updateCategory: (id: string, patch: CategoryUpdate) =>
    request<{ category: CategoryRow }>(`/money/categories/${id}`, { method: "PATCH", body: json(patch) }).then(
      (r) => r.category,
    ),
  deleteCategory: (id: string) => request<{ ok: true }>(`/money/categories/${id}`, { method: "DELETE" }),

  bills: () => request<{ bills: BillRow[] }>("/money/bills").then((r) => r.bills),
  createBill: (input: BillCreate) =>
    request<{ bill: BillRow }>("/money/bills", { method: "POST", body: json(input) }).then((r) => r.bill),
  updateBill: (id: string, patch: BillUpdate) =>
    request<{ bill: BillRow }>(`/money/bills/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.bill),
  stopBill: (id: string) => request<{ bill: BillRow }>(`/money/bills/${id}`, { method: "DELETE" }),

  createGoal: (input: GoalCreate) =>
    request<{ goal: GoalRow }>("/money/goals", { method: "POST", body: json(input) }).then((r) => r.goal),
  archiveGoal: (id: string) => request(`/money/goals/${id}`, { method: "PATCH", body: json({ archived: true }) }),
  addContribution: (goalId: string, input: ContributionCreate) =>
    request(`/money/goals/${goalId}/contributions`, { method: "POST", body: json(input) }),

  createDebt: (input: DebtCreate) =>
    request<{ debt: DebtRow }>("/money/debts", { method: "POST", body: json(input) }).then((r) => r.debt),
  archiveDebt: (id: string) => request(`/money/debts/${id}`, { method: "PATCH", body: json({ archived: true }) }),
  addPayment: (debtId: string, input: PaymentCreate) =>
    request(`/money/debts/${debtId}/payments`, { method: "POST", body: json(input) }),
};
