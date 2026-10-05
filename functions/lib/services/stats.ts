import { and, count, eq, gte } from "drizzle-orm";
import { settings, shippedEvents } from "../../../db/schema";
import { SETTING_KEYS, type SettingsInput, type Stats } from "../../../shared/schemas";
import { startOfBerlinWeek } from "../../../shared/time";
import type { Db } from "../db";

export async function getStats(db: Db, userId: string): Promise<Stats> {
  const weekStartsAt = startOfBerlinWeek();
  const [shipped, hours] = await db.batch([
    db
      .select({ n: count() })
      .from(shippedEvents)
      .where(and(eq(shippedEvents.userId, userId), gte(shippedEvents.shippedAt, weekStartsAt))),
    db.select().from(settings).where(eq(settings.userId, userId)),
  ]);
  const raw = hours.find((s) => s.key === SETTING_KEYS.availableHoursThisWeek)?.value;
  const parsed = raw === undefined ? NaN : Number(raw);
  return {
    shippedThisWeek: shipped[0]?.n ?? 0,
    availableHoursThisWeek: Number.isFinite(parsed) ? parsed : null,
    weekStartsAt,
  };
}

export async function putSettings(db: Db, userId: string, input: SettingsInput): Promise<Stats> {
  const value = String(input.availableHoursThisWeek);
  await db
    .insert(settings)
    .values({ userId, key: SETTING_KEYS.availableHoursThisWeek, value })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } });
  return getStats(db, userId);
}
