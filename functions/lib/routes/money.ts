import { Hono } from "hono";
import {
  billCreateSchema,
  billUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  contributionCreateSchema,
  debtCreateSchema,
  debtUpdateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  goalCreateSchema,
  goalUpdateSchema,
  incomeCreateSchema,
  incomeUpdateSchema,
  monthQuerySchema,
  paymentCreateSchema,
  wantBuySchema,
  wantCreateSchema,
} from "../../../shared/money-schemas";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import * as crud from "../services/money/crud";
import { getReview, getSuggestions } from "../services/money/insights";
import { getCharts, getOverview, listExpenses } from "../services/money/overview";
import { buyWant, createWant, deleteWant, listWants, skipWant } from "../services/money/wants";
import { validate } from "../validate";

const db = (c: { env: AppEnv["Bindings"] }) => getDb(c.env.DB);
const ok = { ok: true } as const;

export const moneyRoutes = new Hono<AppEnv>()
  .get("/overview", validate("query", monthQuerySchema), async (c) =>
    c.json(await getOverview(db(c), c.get("userId"), c.req.valid("query").month)),
  )
  .get("/charts", validate("query", monthQuerySchema), async (c) =>
    c.json(await getCharts(db(c), c.get("userId"), c.req.valid("query").month)),
  )
  .get("/review", validate("query", monthQuerySchema), async (c) =>
    c.json(await getReview(db(c), c.get("userId"), c.req.valid("query").month)),
  )
  .get("/suggestions", async (c) => c.json(await getSuggestions(db(c), c.get("userId"))))

  .get("/categories", async (c) => c.json({ categories: await crud.listCategories(db(c), c.get("userId")) }))
  .post("/categories", validate("json", categoryCreateSchema), async (c) =>
    c.json({ category: await crud.createCategory(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/categories/:id", validate("json", categoryUpdateSchema), async (c) =>
    c.json({ category: await crud.updateCategory(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/categories/:id", async (c) => {
    await crud.deleteCategory(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })

  .get("/expenses", validate("query", monthQuerySchema), async (c) =>
    c.json({ expenses: await listExpenses(db(c), c.get("userId"), c.req.valid("query").month) }),
  )
  .post("/expenses", validate("json", expenseCreateSchema), async (c) =>
    c.json({ expense: await crud.createExpense(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/expenses/:id", validate("json", expenseUpdateSchema), async (c) =>
    c.json({ expense: await crud.updateExpense(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/expenses/:id", async (c) => {
    await crud.deleteExpense(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })

  .get("/bills", async (c) => c.json({ bills: await crud.listBills(db(c), c.get("userId")) }))
  .post("/bills", validate("json", billCreateSchema), async (c) =>
    c.json({ bill: await crud.createBill(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/bills/:id", validate("json", billUpdateSchema), async (c) =>
    c.json({ bill: await crud.updateBill(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/bills/:id", async (c) => c.json({ bill: await crud.deactivateBill(db(c), c.get("userId"), c.req.param("id")) }))

  .post("/income", validate("json", incomeCreateSchema), async (c) =>
    c.json({ income: await crud.createIncome(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/income/:id", validate("json", incomeUpdateSchema), async (c) =>
    c.json({ income: await crud.updateIncome(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/income/:id", async (c) => {
    await crud.deleteIncome(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })

  .get("/goals", async (c) => c.json({ goals: await crud.listGoals(db(c), c.get("userId")) }))
  .post("/goals", validate("json", goalCreateSchema), async (c) =>
    c.json({ goal: await crud.createGoal(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/goals/:id", validate("json", goalUpdateSchema), async (c) =>
    c.json({ goal: await crud.updateGoal(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/goals/:id", async (c) => {
    await crud.deleteGoal(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })
  .get("/goals/:id/contributions", async (c) =>
    c.json({ contributions: await crud.listContributions(db(c), c.get("userId"), c.req.param("id")) }),
  )
  .post("/goals/:id/contributions", validate("json", contributionCreateSchema), async (c) =>
    c.json({ contribution: await crud.addContribution(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }, 201),
  )
  .delete("/contributions/:id", async (c) => {
    await crud.deleteContribution(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })

  .get("/debts", async (c) => c.json({ debts: await crud.listDebts(db(c), c.get("userId")) }))
  .post("/debts", validate("json", debtCreateSchema), async (c) =>
    c.json({ debt: await crud.createDebt(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/debts/:id", validate("json", debtUpdateSchema), async (c) =>
    c.json({ debt: await crud.updateDebt(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/debts/:id", async (c) => {
    await crud.deleteDebt(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })
  .get("/debts/:id/payments", async (c) =>
    c.json({ payments: await crud.listPayments(db(c), c.get("userId"), c.req.param("id")) }),
  )
  .post("/debts/:id/payments", validate("json", paymentCreateSchema), async (c) =>
    c.json({ payment: await crud.addPayment(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }, 201),
  )
  .delete("/payments/:id", async (c) => {
    await crud.deletePayment(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  })
  .get("/wants", async (c) => c.json(await listWants(db(c), c.get("userId"))))
  .post("/wants", validate("json", wantCreateSchema), async (c) =>
    c.json({ want: await createWant(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .post("/wants/:id/buy", validate("json", wantBuySchema), async (c) =>
    c.json(await buyWant(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json"))),
  )
  .post("/wants/:id/skip", async (c) => c.json({ want: await skipWant(db(c), c.get("userId"), c.req.param("id")) }))
  .delete("/wants/:id", async (c) => {
    await deleteWant(db(c), c.get("userId"), c.req.param("id"));
    return c.json(ok);
  });
