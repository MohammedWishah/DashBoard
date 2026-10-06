import { Hono } from "hono";
import { agentExpenseCreateSchema } from "../../../shared/money-schemas";
import { shipProjectSchema, updateProjectSchema } from "../../../shared/schemas";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { logAgentExpense, undoAgentExpense } from "../services/money/agent";
import { getMoneyLeft } from "../services/money/overview";
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
  );
