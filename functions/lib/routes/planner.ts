import { Hono } from "hono";
import { dateSchema, monthQuerySchema } from "../../../shared/money-schemas";
import { dayQuerySchema, dayTasksPutSchema, habitCreateSchema, habitUpdateSchema, taskUpdateSchema } from "../../../shared/planner-schemas";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import * as planner from "../services/planner";
import { validate } from "../validate";

const db = (c: { env: AppEnv["Bindings"] }) => getDb(c.env.DB);

/** Path dates are checked like body dates. */
function pathDate(value: string) {
  const parsed = dateSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "validation_error", "Use a date like 2026-10-06");
  return parsed.data;
}

export const plannerRoutes = new Hono<AppEnv>()
  .get("/day", validate("query", dayQuerySchema), async (c) => c.json(await planner.getDay(db(c), c.get("userId"), c.req.valid("query").date)))
  .put("/day/:date/tasks", validate("json", dayTasksPutSchema), async (c) =>
    c.json({ tasks: await planner.putDayTasks(db(c), c.get("userId"), pathDate(c.req.param("date")), c.req.valid("json").tasks) }),
  )
  .patch("/tasks/:id", validate("json", taskUpdateSchema), async (c) =>
    c.json({ task: await planner.updateTask(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .get("/month", validate("query", monthQuerySchema), async (c) =>
    c.json(await planner.getMonth(db(c), c.get("userId"), c.req.valid("query").month)),
  )
  .get("/habits", async (c) => c.json({ habits: await planner.listHabits(db(c), c.get("userId")) }))
  .post("/habits", validate("json", habitCreateSchema), async (c) =>
    c.json({ habit: await planner.createHabit(db(c), c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/habits/:id", validate("json", habitUpdateSchema), async (c) =>
    c.json({ habit: await planner.updateHabit(db(c), c.get("userId"), c.req.param("id"), c.req.valid("json")) }),
  )
  .delete("/habits/:id", async (c) => {
    await planner.deleteHabit(db(c), c.get("userId"), c.req.param("id"));
    return c.json({ ok: true });
  })
  .put("/habits/:id/checks/:period", async (c) => {
    const r = await planner.setCheck(db(c), c.get("userId"), c.req.param("id"), pathDate(c.req.param("period")), true);
    return c.json({ habitId: r.habit.id, period: r.period, checked: r.checked });
  })
  .delete("/habits/:id/checks/:period", async (c) => {
    const r = await planner.setCheck(db(c), c.get("userId"), c.req.param("id"), pathDate(c.req.param("period")), false);
    return c.json({ habitId: r.habit.id, period: r.period, checked: r.checked });
  });
