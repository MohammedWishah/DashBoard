import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { users } from "../../../db/schema";
import { accessFor } from "../auth/users";
import { getDb } from "../db";
import { ApiError } from "../errors";
import type { AppEnv } from "../env";
import { userForAgentToken } from "../services/agent-tokens";

/**
 * Agent routes: `Authorization: Bearer lb_...`, a per-user token created in the app.
 * The token's owner becomes the request's user, with that person's features.
 */
export const requireAgentToken = createMiddleware<AppEnv>(async (c, next) => {
  const match = /^Bearer\s+(lb_[A-Za-z0-9_-]{20,})$/i.exec(c.req.header("Authorization") ?? "");
  const db = getDb(c.env.DB);
  const userId = match ? await userForAgentToken(db, match[1]) : null;
  if (!userId) throw new ApiError(401, "unauthorized", "Missing or invalid bearer token");
  const email = (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get())?.email ?? "";
  const access = await accessFor(db, userId, email, c.env.OWNER_EMAIL);
  c.set("userId", userId);
  c.set("email", email);
  c.set("isAdmin", access.isAdmin);
  c.set("features", access.features);
  c.set("extras", access.extras);
  await next();
});
