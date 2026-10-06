import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { users } from "../../../db/schema";
import { EXTRAS, FEATURES, effectiveFeatures } from "../../../shared/features";
import { isOwner } from "../auth/users";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../errors";
import { validate } from "../validate";

const accessSchema = z
  .object({
    features: z.array(z.enum(FEATURES)).max(FEATURES.length).optional(),
    extras: z.array(z.enum(EXTRAS)).max(EXTRAS.length).optional(),
  })
  .refine((b) => b.features !== undefined || b.extras !== undefined, "Send features or extras");

const storedExtras = (stored: readonly string[]) => EXTRAS.filter((e) => stored.includes(e));

/** People and what they can use. Mounted behind requireAdmin. */
export const adminRoutes = new Hono<AppEnv>()
  .get("/users", async (c) => {
    const rows = await getDb(c.env.DB).select().from(users).orderBy(asc(users.createdAt));
    const people = rows.map((u) => {
      const isAdmin = isOwner(u.email, c.env.OWNER_EMAIL);
      return {
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
        isAdmin,
        features: effectiveFeatures(isAdmin, u.features),
        extras: storedExtras(u.features),
      };
    });
    // Admin first, then everyone else in the order they joined.
    return c.json({ users: people.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)) });
  })
  .patch("/users/:id", validate("json", accessSchema), async (c) => {
    const db = getDb(c.env.DB);
    const user = await db.select().from(users).where(eq(users.id, c.req.param("id"))).get();
    if (!user) throw notFound("Person");
    const isAdmin = isOwner(user.email, c.env.OWNER_EMAIL);
    const body = c.req.valid("json");
    if (isAdmin && body.features !== undefined) {
      throw new ApiError(400, "admin_has_all", "The admin always has every section");
    }
    // Merge: changing sections keeps extras, and changing extras keeps sections.
    const sections = body.features ? [...new Set(body.features)] : FEATURES.filter((f) => user.features.includes(f));
    const extras = body.extras ? [...new Set(body.extras)] : storedExtras(user.features);
    await db.update(users).set({ features: [...sections, ...extras] }).where(eq(users.id, user.id));
    return c.json({
      user: { id: user.id, email: user.email, createdAt: user.createdAt, isAdmin, features: effectiveFeatures(isAdmin, sections), extras },
    });
  });
