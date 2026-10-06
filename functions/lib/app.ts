import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiErrorBody } from "../../shared/schemas";
import type { AppEnv } from "./env";
import { ApiError } from "./errors";
import { requireUser } from "./middleware/session";
import { requireAgentToken } from "./middleware/agent-auth";
import { requireAdmin, requireExtra, requireFeature } from "./middleware/features";
import { adminRoutes } from "./routes/admin";
import { agentRoutes } from "./routes/agent";
import { browserRoutes } from "./routes/browser";
import { moneyRoutes } from "./routes/money";
import { plannerRoutes } from "./routes/planner";

const app = new Hono<AppEnv>().basePath("/api");

// Agent routes use per-user agent tokens.
// Everything else under /api requires a signed-in Supabase user (default deny).
app.use("*", async (c, next) => {
  const isAgent = c.req.path === "/api/agent" || c.req.path.startsWith("/api/agent/");
  return isAgent ? requireAgentToken(c, next) : requireUser(c, next);
});

// Sections are switched on per person; the admin has all of them.
const projectPaths = ["/projects", "/projects/*", "/stats", "/settings", "/agent/projects", "/agent/projects/*", "/agent/next-actions"];
for (const path of projectPaths) app.use(path, requireFeature("projects"));
for (const path of ["/money/*", "/agent/money/*"]) app.use(path, requireFeature("money"));
for (const path of ["/planner/*", "/agent/planner/*"]) app.use(path, requireFeature("planner"));
for (const path of ["/money/wants", "/money/wants/*", "/agent/money/wants", "/agent/money/wants/*"]) app.use(path, requireExtra("wants"));
app.use("/planner/wins", requireExtra("wins"));
for (const path of ["/planner/energy/*", "/agent/planner/energy"]) app.use(path, requireExtra("energy"));
app.use("/admin/*", requireAdmin);

app.route("/agent", agentRoutes);
app.route("/money", moneyRoutes);
app.route("/planner", plannerRoutes);
app.route("/admin", adminRoutes);
app.route("/", browserRoutes);

app.notFound((c) => c.json<ApiErrorBody>({ error: { code: "not_found", message: "Route not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json<ApiErrorBody>({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  if (err instanceof HTTPException) {
    // e.g. malformed JSON bodies rejected by the validator
    return c.json<ApiErrorBody>({ error: { code: "bad_request", message: err.message } }, err.status);
  }
  console.error(err);
  return c.json<ApiErrorBody>({ error: { code: "internal", message: "Internal server error" } }, 500);
});

export default app;
