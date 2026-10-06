import { and, desc, eq, sql } from "drizzle-orm";
import { wants } from "../../../../db/schema";
import { berlinToday, eurosToCents, formatEuro, waitHours } from "../../../../shared/money";
import type { WantBuy, WantCreate, WantRow, WantsView } from "../../../../shared/money-schemas";
import { normalizeName } from "../../../../shared/rules";
import type { Db } from "../../db";
import { ApiError, notFound } from "../../errors";
import { resolveCategory } from "./agent";
import { createExpense } from "./crud";

// The want list: a cooling-off queue for impulse buys. Buying logs a normal expense.

const strip = ({ userId: _owner, ...rest }: typeof wants.$inferSelect): WantRow => rest;
const where = (userId: string, id: string) => and(eq(wants.id, id), eq(wants.userId, userId));

async function getWant(db: Db, userId: string, id: string): Promise<WantRow> {
  const row = await db.select().from(wants).where(where(userId, id)).get();
  if (!row) throw notFound("Want");
  return strip(row);
}

function assertWaiting(w: WantRow) {
  if (w.status !== "waiting") throw new ApiError(409, "already_decided", `${w.name} was already ${w.status}`);
}

export async function savedCents(db: Db, userId: string): Promise<number> {
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${wants.priceCents}), 0)` })
    .from(wants)
    .where(and(eq(wants.userId, userId), eq(wants.status, "skipped")))
    .get();
  return Number(row?.total ?? 0);
}

export async function listWants(db: Db, userId: string): Promise<WantsView> {
  const rows = (await db.select().from(wants).where(eq(wants.userId, userId)).orderBy(desc(wants.createdAt))).map(strip);
  return {
    waiting: rows.filter((w) => w.status === "waiting").sort((a, b) => a.readyAt.localeCompare(b.readyAt)),
    decided: rows.filter((w) => w.status !== "waiting").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).slice(0, 20),
    savedCents: await savedCents(db, userId),
  };
}

export async function createWant(db: Db, userId: string, input: WantCreate, now = new Date()): Promise<WantRow> {
  const row = {
    id: crypto.randomUUID(),
    userId,
    name: input.name,
    priceCents: input.priceCents,
    url: input.url || null,
    createdAt: now.toISOString(),
    readyAt: new Date(now.getTime() + waitHours(input.priceCents) * 3600_000).toISOString(),
    status: "waiting" as const,
    decidedAt: null,
    expenseId: null,
  };
  await db.insert(wants).values(row);
  return strip(row);
}

export async function buyWant(db: Db, userId: string, id: string, input: WantBuy, now = new Date()) {
  const w = await getWant(db, userId, id);
  assertWaiting(w);
  // Claim it first, so a double tap can't log two expenses.
  const claimed = await db
    .update(wants)
    .set({ status: "bought", decidedAt: now.toISOString() })
    .where(and(where(userId, id), eq(wants.status, "waiting")))
    .returning()
    .get();
  if (!claimed) throw new ApiError(409, "already_decided", `${w.name} was already decided`);
  try {
    const expense = await createExpense(db, userId, {
      categoryId: input.categoryId,
      amountCents: input.priceCents ?? w.priceCents,
      spentOn: input.spentOn ?? berlinToday(now),
      note: w.name,
    });
    await db.update(wants).set({ expenseId: expense.id }).where(where(userId, id));
    return { want: { ...strip(claimed), expenseId: expense.id }, expenseId: expense.id };
  } catch (err) {
    // The category was wrong or gone: put the want back so it can be bought again.
    await db.update(wants).set({ status: "waiting", decidedAt: null }).where(where(userId, id));
    throw err;
  }
}

export async function skipWant(db: Db, userId: string, id: string, now = new Date()): Promise<WantRow> {
  const w = await getWant(db, userId, id);
  assertWaiting(w);
  await db.update(wants).set({ status: "skipped", decidedAt: now.toISOString() }).where(where(userId, id));
  return { ...w, status: "skipped", decidedAt: now.toISOString() };
}

export async function deleteWant(db: Db, userId: string, id: string) {
  await getWant(db, userId, id);
  await db.delete(wants).where(where(userId, id));
}

export async function readyWants(db: Db, userId: string, now = new Date()): Promise<WantRow[]> {
  return (await listWants(db, userId)).waiting.filter((w) => w.readyAt <= now.toISOString());
}

export async function skippedBetween(db: Db, userId: string, fromIso: string, toIso: string): Promise<WantRow[]> {
  return (await db.select().from(wants).where(and(eq(wants.userId, userId), eq(wants.status, "skipped"))))
    .map(strip)
    .filter((w) => w.decidedAt !== null && w.decidedAt >= fromIso && w.decidedAt < toIso);
}

// ---- Agent ------------------------------------------------------------------

const days = (h: number) => `${h / 24} day${h === 24 ? "" : "s"}`;

async function findWaiting(db: Db, userId: string, name: string): Promise<WantRow> {
  const waiting = (await listWants(db, userId)).waiting;
  const match = waiting.find((w) => normalizeName(w.name) === normalizeName(name));
  if (match) return match;
  throw new ApiError(404, "unknown_want", `Nothing called "${name}" is waiting on your want list.`, {
    wants: waiting.map((w) => ({ name: w.name, priceCents: w.priceCents })),
  });
}

export async function agentAddWant(db: Db, userId: string, input: { name: string; amount: number }, now = new Date()) {
  const priceCents = eurosToCents(input.amount)!;
  const want = await createWant(db, userId, { name: input.name, priceCents }, now);
  return {
    want,
    speech: `Added ${want.name} (${formatEuro(priceCents)}) to your want list. Ask me again in ${days(waitHours(priceCents))}.`,
  };
}

export async function agentSkipWant(db: Db, userId: string, input: { name: string }, now = new Date()) {
  const want = await skipWant(db, userId, (await findWaiting(db, userId, input.name)).id, now);
  return { want, speech: `Skipped ${want.name}. Saved ${formatEuro(want.priceCents)} by waiting.` };
}

export async function agentBuyWant(db: Db, userId: string, input: { name: string; category: string; amount?: number }, now = new Date()) {
  const target = await findWaiting(db, userId, input.name);
  const category = await resolveCategory(db, userId, input.category);
  const priceCents = input.amount === undefined ? target.priceCents : eurosToCents(input.amount)!;
  const r = await buyWant(db, userId, target.id, { categoryId: category.id, priceCents }, now);
  return { ...r, speech: `Bought ${target.name}: logged ${formatEuro(priceCents)} in ${category.name}.` };
}
