import { Hono } from "hono";
import { agentExpenseCreateSchema, agentWantBuySchema, agentWantCreateSchema, agentWantNameSchema } from "../../../shared/money-schemas";
import { agentEnergySchema, agentHabitCheckSchema, agentTaskDoneSchema, agentTasksSchema } from "../../../shared/planner-schemas";
import { shipProjectSchema, updateProjectSchema } from "../../../shared/schemas";
import { getDb } from "../db";
import { ApiError } from "../errors";
import type { AppEnv } from "../env";
import { logAgentExpense, undoAgentExpense } from "../services/money/agent";
import { getMoneyLeft } from "../services/money/overview";
import { agentAddWant, agentBuyWant, agentSkipWant } from "../services/money/wants";
import { getBriefing } from "../services/briefing";
import { agentCheck, agentEnergy, agentSetTasks, agentTaskDone, agentToday } from "../services/planner-agent";
import { listProjects, resolveProjectRef, shipProject, updateProject } from "../services/projects";
import { validate } from "../validate";

/**
 * Routes for a voice assistant, authenticated by the owner's agent token.
 * `:ref` is a project id or its name (case-insensitive), e.g. /api/agent/projects/Garden%20Planner/ship
 */
export const agentRoutes = new Hono<AppEnv>()
  .get("/projects", async (c) => c.json({ projects: await listProjects(getDb(c.env.DB), c.get("userId")) }))
  .get("/next-actions", async (c) => {
    const active = (await listProjects(getDb(c.env.DB), c.get("userId"))).filter((p) => p.status === "active");
    const items = active.map((p) => ({ name: p.name, nextAction: p.nextAction }));
    const speech =
      items.length === 0
        ? "No active projects."
        : items.map((i) => `${i.name}: ${i.nextAction.replace(/[.!?]+$/, "")}.`).join(" ");
    return c.json({ items, speech });
  })
  .patch("/projects/:ref", validate("json", updateProjectSchema), async (c) => {
    const db = getDb(c.env.DB);
    const userId = c.get("userId");
    const target = await resolveProjectRef(db, userId, c.req.param("ref"));
    return c.json({ project: await updateProject(db, userId, target.id, c.req.valid("json")) });
  })
  .post("/projects/:ref/ship", validate("json", shipProjectSchema), async (c) => {
    const db = getDb(c.env.DB);
    const userId = c.get("userId");
    const target = await resolveProjectRef(db, userId, c.req.param("ref"));
    return c.json(await shipProject(db, userId, target.id, c.req.valid("json").note), 201);
  })
  // "How much is left this month?"
  .get("/money/left", async (c) => c.json(await getMoneyLeft(getDb(c.env.DB), c.get("userId"))))
  // "50 euro food". Category by name; Other is created on first use.
  .post("/money/expenses", validate("json", agentExpenseCreateSchema), async (c) =>
    c.json(await logAgentExpense(getDb(c.env.DB), c.get("userId"), c.req.valid("json")), 201),
  )
  // "Undo that", with the id from the POST reply.
  .delete("/money/expenses/:id", async (c) =>
    c.json(await undoAgentExpense(getDb(c.env.DB), c.get("userId"), c.req.param("id"))),
  )
  // "What's my plan today?"
  .get("/planner/today", async (c) => c.json(await agentToday(getDb(c.env.DB), c.get("userId"), c.var.extras.includes("kind_streaks"))))
  // "did gym": ticks today, this week or this month, depending on the habit.
  .post("/planner/habits/check", validate("json", agentHabitCheckSchema), async (c) =>
    c.json(await agentCheck(getDb(c.env.DB), c.get("userId"), c.req.valid("json"), true, c.var.extras.includes("kind_streaks"))),
  )
  .delete("/planner/habits/check", validate("json", agentHabitCheckSchema), async (c) =>
    c.json(await agentCheck(getDb(c.env.DB), c.get("userId"), c.req.valid("json"), false, c.var.extras.includes("kind_streaks"))),
  )
  // "top 3: A, B, C" replaces the day's list.
  .put("/planner/tasks", validate("json", agentTasksSchema), async (c) =>
    c.json(await agentSetTasks(getDb(c.env.DB), c.get("userId"), c.req.valid("json"))),
  )
  // "done with A", or by position "2".
  .post("/planner/tasks/done", validate("json", agentTaskDoneSchema), async (c) =>
    c.json(await agentTaskDone(getDb(c.env.DB), c.get("userId"), c.req.valid("json"))),
  )
  // "I want AirPods, 200": goes on the want list, not the budget.
  .post("/money/wants", validate("json", agentWantCreateSchema), async (c) =>
    c.json(await agentAddWant(getDb(c.env.DB), c.get("userId"), c.req.valid("json")), 201),
  )
  .post("/money/wants/skip", validate("json", agentWantNameSchema), async (c) =>
    c.json(await agentSkipWant(getDb(c.env.DB), c.get("userId"), c.req.valid("json"))),
  )
  .post("/money/wants/buy", validate("json", agentWantBuySchema), async (c) =>
    c.json(await agentBuyWant(getDb(c.env.DB), c.get("userId"), c.req.valid("json"))),
  )
  // Hermes script jobs: an empty message means "say nothing".
  .get("/briefing/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (kind !== "morning" && kind !== "evening" && kind !== "weekly") {
      throw new ApiError(400, "invalid_kind", "Use morning, evening or weekly");
    }
    const message = await getBriefing(getDb(c.env.DB), c.get("userId"), kind, {
      sections: c.get("features"),
      extras: c.get("extras"),
    });
    return c.json({ message });
  })
  // "energy high"
  .post("/planner/energy", validate("json", agentEnergySchema), async (c) =>
    c.json(await agentEnergy(getDb(c.env.DB), c.get("userId"), c.req.valid("json"))),
  );
