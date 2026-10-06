import type {
  BillCreate,
  BillRow,
  BillUpdate,
  CategoryCreate,
  CategoryRow,
  CategoryUpdate,
  ContributionCreate,
  ContributionRow,
  DebtCreate,
  DebtRow,
  DebtUpdate,
  ExpenseCreate,
  ExpenseItem,
  ExpenseRow,
  ExpenseUpdate,
  GoalCreate,
  GoalRow,
  GoalUpdate,
  IncomeCreate,
  IncomeRow,
  IncomeUpdate,
  MoneyCharts,
  MoneyOverview,
  MoneySuggestions,
  PaymentCreate,
  PaymentRow,
  WantCreate,
  WantRow,
  WantsView,
} from "@shared/money-schemas";
import type { MonthReview } from "@shared/money";
import { request } from "@/lib/api";

const json = (data: unknown) => JSON.stringify(data);
const q = (month?: string) => (month ? `?month=${month}` : "");

export const moneyApi = {
  overview: (month?: string) => request<MoneyOverview>(`/money/overview${q(month)}`),
  charts: (month?: string) => request<MoneyCharts>(`/money/charts${q(month)}`),
  review: (month: string) => request<MonthReview>(`/money/review${q(month)}`),
  suggestions: () => request<MoneySuggestions>("/money/suggestions"),
  expenses: (month?: string) => request<{ expenses: ExpenseItem[] }>(`/money/expenses${q(month)}`).then((r) => r.expenses),

  createExpense: (input: ExpenseCreate) =>
    request<{ expense: ExpenseRow }>("/money/expenses", { method: "POST", body: json(input) }).then((r) => r.expense),
  updateExpense: (id: string, patch: ExpenseUpdate) =>
    request<{ expense: ExpenseRow }>(`/money/expenses/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.expense),
  deleteExpense: (id: string) => request<{ ok: true }>(`/money/expenses/${id}`, { method: "DELETE" }),

  createIncome: (input: IncomeCreate) =>
    request<{ income: IncomeRow }>("/money/income", { method: "POST", body: json(input) }).then((r) => r.income),
  updateIncome: (id: string, patch: IncomeUpdate) =>
    request<{ income: IncomeRow }>(`/money/income/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.income),
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
  updateGoal: (id: string, patch: GoalUpdate) =>
    request<{ goal: GoalRow }>(`/money/goals/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.goal),
  contributions: (goalId: string) =>
    request<{ contributions: ContributionRow[] }>(`/money/goals/${goalId}/contributions`).then((r) => r.contributions),
  addContribution: (goalId: string, input: ContributionCreate) =>
    request(`/money/goals/${goalId}/contributions`, { method: "POST", body: json(input) }),
  deleteContribution: (id: string) => request<{ ok: true }>(`/money/contributions/${id}`, { method: "DELETE" }),

  createDebt: (input: DebtCreate) =>
    request<{ debt: DebtRow }>("/money/debts", { method: "POST", body: json(input) }).then((r) => r.debt),
  updateDebt: (id: string, patch: DebtUpdate) =>
    request<{ debt: DebtRow }>(`/money/debts/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.debt),
  payments: (debtId: string) => request<{ payments: PaymentRow[] }>(`/money/debts/${debtId}/payments`).then((r) => r.payments),
  addPayment: (debtId: string, input: PaymentCreate) =>
    request(`/money/debts/${debtId}/payments`, { method: "POST", body: json(input) }),
  deletePayment: (id: string) => request<{ ok: true }>(`/money/payments/${id}`, { method: "DELETE" }),

  wants: () => request<WantsView>("/money/wants"),
  createWant: (input: WantCreate) =>
    request<{ want: WantRow }>("/money/wants", { method: "POST", body: json(input) }).then((r) => r.want),
  buyWant: (id: string, input: { categoryId: string }) =>
    request<{ want: WantRow; expenseId: string }>(`/money/wants/${id}/buy`, { method: "POST", body: json(input) }),
  skipWant: (id: string) => request<{ want: WantRow }>(`/money/wants/${id}/skip`, { method: "POST" }),
  deleteWant: (id: string) => request<{ ok: true }>(`/money/wants/${id}`, { method: "DELETE" }),
};
