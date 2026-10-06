import {
  OTHER_CATEGORY_NAME,
  berlinMonth,
  berlinToday,
  eurosToCents,
  findCategoryByName,
  formatEuro,
  speakEuro,
} from "../../../../shared/money";
import type { AgentExpenseCreate } from "../../../../shared/money-schemas";
import { normalizeName } from "../../../../shared/rules";
import type { Db } from "../../db";
import { ApiError } from "../../errors";
import {
  createCategory,
  createExpense,
  deleteExpense,
  getCategory,
  getExpense,
  listCategories,
  updateCategory,
} from "./crud";
import { getOverview } from "./overview";

// Voice-agent side of Money. The agent (Hermes) does the language work and sends a
// category name; this file matches it, falls back to Other, and writes the reply.

async function resolveCategory(db: Db, userId: string, requested: string) {
  const all = await listCategories(db, userId);
  const active = all.filter((c) => !c.archived);
  const match = findCategoryByName(active, requested);
  if (match) return match;

  if (normalizeName(requested) === normalizeName(OTHER_CATEGORY_NAME)) {
    // An archived Other would make a new one clash on name, so bring it back instead.
    const archived = findCategoryByName(all.filter((c) => c.archived), OTHER_CATEGORY_NAME);
    if (archived) {
      await updateCategory(db, userId, archived.id, { archived: false });
      return { ...archived, archived: false };
    }
    return createCategory(db, userId, { name: OTHER_CATEGORY_NAME });
  }

  throw new ApiError(
    404,
    "unknown_category",
    `No category named "${requested}". Retry with the closest of these, or with "${OTHER_CATEGORY_NAME}" and the item as the note.`,
    { categories: active.map((c) => c.name) },
  );
}

export async function logAgentExpense(db: Db, userId: string, input: AgentExpenseCreate, now = new Date()) {
  const category = await resolveCategory(db, userId, input.category);
  const amountCents = eurosToCents(input.amount)!; // the schema already rejected anything else
  const spentOn = input.spentOn ?? berlinToday(now);
  const expense = await createExpense(db, userId, { categoryId: category.id, amountCents, spentOn, note: input.note });

  const parts = [`Logged ${formatEuro(amountCents)} in ${category.name}.`];
  if (category.monthlyLimitCents !== null && spentOn.slice(0, 7) === berlinMonth(now)) {
    const left = (await getOverview(db, userId, undefined, now)).categories.find((c) => c.id === category.id)?.leftCents;
    if (left != null) {
      parts.push(
        left >= 0
          ? `${speakEuro(left)} left in ${category.name} this month.`
          : `${category.name} is ${speakEuro(-left)} over this month.`,
      );
    }
  }

  return {
    expense: { id: expense.id, category: category.name, amountCents, spentOn, note: expense.note },
    speech: parts.join(" "),
  };
}

export async function undoAgentExpense(db: Db, userId: string, id: string) {
  const expense = await getExpense(db, userId, id);
  const category = await getCategory(db, userId, expense.categoryId);
  await deleteExpense(db, userId, id);
  return { speech: `Removed ${formatEuro(expense.amountCents)} from ${category.name}.` };
}
