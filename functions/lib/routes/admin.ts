import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { users } from "../../../db/schema";
import { FEATURES, effectiveFeatures } from "../../../shared/features";
import { isOwner } from "../auth/users";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../errors";
import { validate } from "../validate";

const featuresSchema = z.object({ features: z.array(z.enum(FEATURES)).max(FEATURES.length) });

/** People and what they can use. Mounted behind requireAdmin. */
export const adminRoutes = new Hono<AppEnv>()
  .get("/users", async (c) => {
    const rows = await getDb(c.env.DB).select().from(users).orderBy(asc(users.createdAt));
    const people = rows.map((u) => {
      const isAdmin = isOwner(u.email, c.env.OWNER_EMAIL);
      return { id: u.id, email: u.email, createdAt: u.createdAt, isAdmin, features: effectiveFeatures(isAdmin, u.features) };
    });
    // Admin first, then everyone else in the order they joined.
    return c.json({ users: people.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)) });
  })
  .patch("/users/:id", validate("json", featuresSchema), async (c) => {
    const db = getDb(c.env.DB);
    const user = await db.select().from(users).where(eq(users.id, c.req.param("id"))).get();
    if (!user) throw notFound("Person");
    if (isOwner(user.email, c.env.OWNER_EMAIL)) {
      throw new ApiError(400, "admin_has_all", "The admin always has every feature");
    }
    const features = [...new Set(c.req.valid("json").features)];
    await db.update(users).set({ features }).where(eq(users.id, user.id));
    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt, isAdmin: false, features } });
  });
