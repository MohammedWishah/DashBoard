import { and, count, eq, ne } from "drizzle-orm";
import {
  categories,
  debtPayments,
  debts,
  expenses,
  income,
  projects,
  recurringBills,
  savingsContributions,
  savingsGoals,
  settings,
  shippedEvents,
  users,
} from "../../../db/schema";
import { effectiveFeatures } from "../../../shared/features";
import { nowIso } from "../../../shared/time";
import type { Db } from "../db";

export const STARTER_CATEGORIES = ["Rent", "Gym", "Food", "Transport", "Fun", "Other"];

// Users already set up in this isolate, so the check costs nothing after the first request.
const ready = new Set<string>();

/** OWNER_EMAIL is the admin: owns the legacy data, has every feature, manages who gets what. */
export const isOwner = (email: string, ownerEmail?: string) =>
  Boolean(ownerEmail) && ownerEmail!.trim().toLowerCase() === email.trim().toLowerCase();

/** Gives every row from before multi-user (user_id = "") to the owner. Idempotent. */
async function claimLegacyData(db: Db, userId: string) {
  await db.batch([
    db.update(projects).set({ userId }).where(eq(projects.userId, "")),
    db.update(shippedEvents).set({ userId }).where(eq(shippedEvents.userId, "")),
    db.update(settings).set({ userId }).where(eq(settings.userId, "")),
    db.update(categories).set({ userId }).where(eq(categories.userId, "")),
    db.update(recurringBills).set({ userId }).where(eq(recurringBills.userId, "")),
    db.update(expenses).set({ userId }).where(eq(expenses.userId, "")),
    db.update(income).set({ userId }).where(eq(income.userId, "")),
    db.update(savingsGoals).set({ userId }).where(eq(savingsGoals.userId, "")),
    db.update(savingsContributions).set({ userId }).where(eq(savingsContributions.userId, "")),
    db.update(debts).set({ userId }).where(eq(debts.userId, "")),
    db.update(debtPayments).set({ userId }).where(eq(debtPayments.userId, "")),
  ]);
}

/**
 * Makes sure a signed-in Supabase user has a row and starter categories, and
 * that OWNER_EMAIL holds the legacy data. Safe to call on every request.
 */
export async function ensureUser(db: Db, userId: string, email: string, ownerEmail?: string): Promise<void> {
  if (ready.has(userId)) return;

  // Only the request that actually inserts the row gets it back, so seeding happens exactly once
  // even if two first requests arrive together.
  const inserted = await db
    .insert(users)
    .values({ id: userId, email, createdAt: nowIso() })
    .onConflictDoNothing()
    .returning({ id: users.id })
    .get();
  if (!inserted) {
    await db.update(users).set({ email }).where(and(eq(users.id, userId), ne(users.email, email)));
  }

  if (isOwner(email, ownerEmail)) await claimLegacyData(db, userId);

  if (inserted) {
    const existing = await db.select({ n: count() }).from(categories).where(eq(categories.userId, userId)).get();
    if ((existing?.n ?? 0) === 0) {
      const createdAt = nowIso();
      await db.insert(categories).values(
        STARTER_CATEGORIES.map((name, i) => ({
          id: crypto.randomUUID(),
          userId,
          name,
          monthlyLimitCents: null,
          sortOrder: i,
          archived: false,
          createdAt,
        })),
      );
    }
  }

  ready.add(userId);
}

/** The person's stored features, resolved against the admin rule. */
export async function accessFor(db: Db, userId: string, email: string, ownerEmail?: string) {
  const row = await db.select({ features: users.features }).from(users).where(eq(users.id, userId)).get();
  const isAdmin = isOwner(email, ownerEmail);
  return { isAdmin, features: effectiveFeatures(isAdmin, row?.features ?? []) };
}
