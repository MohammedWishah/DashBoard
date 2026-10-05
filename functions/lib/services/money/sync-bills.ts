import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { expenses, recurringBills } from "../../../../db/schema";
import { planBillOccurrences } from "../../../../shared/money";
import { nowIso } from "../../../../shared/time";
import type { Db } from "../../db";

/**
 * Turns the user's due recurring bills into expenses, catching up on any months
 * the app wasn't opened. Runs before every money read. Idempotent: logged_through
 * moves forward, and the unique (recurring_bill_id, spent_on) index ignores repeats.
 */
export async function syncBills(db: Db, userId: string, today: string): Promise<number> {
  const bills = await db
    .select()
    .from(recurringBills)
    .where(and(eq(recurringBills.userId, userId), eq(recurringBills.active, true)));
  const statements: BatchItem<"sqlite">[] = [];
  let logged = 0;
  const createdAt = nowIso();

  for (const bill of bills) {
    const due = planBillOccurrences(bill, today);
    if (due.length === 0) continue;
    for (const spentOn of due) {
      statements.push(
        db
          .insert(expenses)
          .values({
            id: crypto.randomUUID(),
            userId,
            categoryId: bill.categoryId,
            amountCents: bill.amountCents,
            spentOn,
            note: bill.name,
            recurringBillId: bill.id,
            createdAt,
          })
          .onConflictDoNothing(),
      );
    }
    statements.push(
      db
        .update(recurringBills)
        .set({ loggedThrough: due[due.length - 1] })
        .where(and(eq(recurringBills.id, bill.id), eq(recurringBills.userId, userId))),
    );
    logged += due.length;
  }

  if (statements.length > 0) {
    await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }
  return logged;
}
