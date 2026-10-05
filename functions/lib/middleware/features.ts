import { createMiddleware } from "hono/factory";
import { FEATURE_LABELS, type Feature } from "../../../shared/features";
import { ApiError } from "../errors";
import type { AppEnv } from "../env";

/** Blocks a section the person hasn't been given. Runs after the auth middleware. */
export const requireFeature = (feature: Feature) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get("features").includes(feature)) {
      throw new ApiError(403, "feature_disabled", `You don't have access to ${FEATURE_LABELS[feature]}. Ask the admin to turn it on.`);
    }
    await next();
  });

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("isAdmin")) throw new ApiError(403, "admin_only", "Only the admin can do this");
  await next();
});
