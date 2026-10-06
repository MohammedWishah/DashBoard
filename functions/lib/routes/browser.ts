import { Hono } from "hono";
import { z } from "zod";
import {
  createProjectSchema,
  exportSchema,
  settingsInputSchema,
  shipProjectSchema,
  updateProjectSchema,
} from "../../../shared/schemas";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { createAgentToken, listAgentTokens, revokeAgentToken } from "../services/agent-tokens";
import { createProject, listProjects, shipProject, updateProject } from "../services/projects";
import { getStats, putSettings } from "../services/stats";
import { exportAll, importAll } from "../services/transfer";
import { validate } from "../validate";

const tokenNameSchema = z.object({ name: z.string().trim().min(1, "Name the token").max(60) });

export const browserRoutes = new Hono<AppEnv>()
  .get("/me", (c) =>
    c.json({
      id: c.get("userId"),
      email: c.get("email"),
      isAdmin: c.get("isAdmin"),
      features: c.get("features"),
      extras: c.get("extras"),
    }),
  )

  .get("/projects", async (c) => c.json({ projects: await listProjects(getDb(c.env.DB), c.get("userId")) }))
  .post("/projects", validate("json", createProjectSchema), async (c) => {
    const project = await createProject(getDb(c.env.DB), c.get("userId"), c.req.valid("json"));
    return c.json({ project }, 201);
  })
  .patch("/projects/:id", validate("json", updateProjectSchema), async (c) => {
    const project = await updateProject(getDb(c.env.DB), c.get("userId"), c.req.param("id"), c.req.valid("json"));
    return c.json({ project });
  })
  .post("/projects/:id/ship", validate("json", shipProjectSchema), async (c) => {
    const result = await shipProject(getDb(c.env.DB), c.get("userId"), c.req.param("id"), c.req.valid("json").note);
    return c.json(result, 201);
  })
  .get("/stats", async (c) => c.json(await getStats(getDb(c.env.DB), c.get("userId"))))
  .put("/settings", validate("json", settingsInputSchema), async (c) => {
    return c.json(await putSettings(getDb(c.env.DB), c.get("userId"), c.req.valid("json")));
  })
  .get("/export", async (c) => {
    const data = await exportAll(getDb(c.env.DB), c.get("userId"));
    const day = data.exportedAt.slice(0, 10);
    c.header("Content-Disposition", `attachment; filename="life-board-${day}.json"`);
    return c.json(data);
  })
  .post("/import", validate("json", exportSchema), async (c) => {
    const imported = await importAll(getDb(c.env.DB), c.get("userId"), c.req.valid("json"));
    return c.json({ imported });
  })

  // Tokens for the voice assistant. The plain token is only in the POST response.
  .get("/agent-tokens", async (c) => c.json({ tokens: await listAgentTokens(getDb(c.env.DB), c.get("userId")) }))
  .post("/agent-tokens", validate("json", tokenNameSchema), async (c) =>
    c.json(await createAgentToken(getDb(c.env.DB), c.get("userId"), c.req.valid("json").name), 201),
  )
  .delete("/agent-tokens/:id", async (c) => {
    await revokeAgentToken(getDb(c.env.DB), c.get("userId"), c.req.param("id"));
    return c.json({ ok: true });
  });
