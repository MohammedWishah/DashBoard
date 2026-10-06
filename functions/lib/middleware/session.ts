import { createMiddleware } from "hono/factory";
import { accessFor, ensureUser } from "../auth/users";
import { verifySupabaseToken } from "../auth/verify";
import { getDb } from "../db";
import { ApiError } from "../errors";
import type { AppEnv } from "../env";

/** Browser routes: a valid Supabase access token in `Authorization: Bearer <jwt>`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header("Authorization") ?? "");
  if (!match) throw new ApiError(401, "unauthorized", "Sign in to continue");
  const { userId, email } = await verifySupabaseToken(match[1], c.env);
  const db = getDb(c.env.DB);
  await ensureUser(db, userId, email, c.env.OWNER_EMAIL);
  // Read fresh on every request so the admin's changes apply right away.
  const access = await accessFor(db, userId, email, c.env.OWNER_EMAIL);
  c.set("userId", userId);
  c.set("email", email);
  c.set("isAdmin", access.isAdmin);
  c.set("features", access.features);
  c.set("extras", access.extras);
  await next();
});
