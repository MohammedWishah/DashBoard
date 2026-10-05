import { Hono } from "hono";
import { shipProjectSchema, updateProjectSchema } from "../../../shared/schemas";
import { getDb } from "../db";
import type { AppEnv } from "../env";
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
  // "How much is left this month?" Read-only; expenses are logged in the app.
  .get("/money/left", async (c) => c.json(await getMoneyLeft(getDb(c.env.DB), c.get("userId"))));
