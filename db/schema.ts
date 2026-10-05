import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Every data table carries the owner's Supabase user id. Rows from before
// multi-user have "" until the OWNER_EMAIL user claims them on first sign-in.
const owner = () => text("user_id").notNull().default("");

// ---- Accounts -------------------------------------------------------------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Supabase auth user id (JWT `sub`)
  email: text("email").notNull(),
  // Sections this person may use (JSON array). The admin (OWNER_EMAIL) always has all of them.
  features: text("features", { mode: "json" }).$type<string[]>().notNull().default(sql`'["money","planner"]'`),
  createdAt: text("created_at").notNull(),
});

export const agentTokens = sqliteTable(
  "agent_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [uniqueIndex("agent_tokens_hash_unique").on(t.tokenHash), index("agent_tokens_user_idx").on(t.userId)],
);

// ---- Projects -------------------------------------------------------------

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "parked", "archived"] }).notNull(),
    nextAction: text("next_action").notNull(),
    doneDefinition: text("done_definition").notNull().default(""),
    lastTouched: text("last_touched").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("projects_status_idx").on(t.status), index("projects_user_idx").on(t.userId)],
);

export const shippedEvents = sqliteTable(
  "shipped_events",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    note: text("note"),
    shippedAt: text("shipped_at").notNull(),
  },
  (t) => [
    index("shipped_events_shipped_at_idx").on(t.shippedAt),
    index("shipped_events_project_id_idx").on(t.projectId),
    index("shipped_events_user_idx").on(t.userId),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    userId: owner(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ---- Money ----------------------------------------------------------------
// Amounts are integer cents. *_on columns are Berlin calendar dates (YYYY-MM-DD).

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    monthlyLimitCents: integer("monthly_limit_cents"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("categories_user_idx").on(t.userId)],
);

export const recurringBills = sqliteTable(
  "recurring_bills",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    amountCents: integer("amount_cents").notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    startsOn: text("starts_on").notNull(),
    // Last due date already turned into an expense. Moving it forward means a
    // deleted auto-logged expense is never recreated.
    loggedThrough: text("logged_through"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("recurring_bills_user_idx").on(t.userId)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    amountCents: integer("amount_cents").notNull(),
    spentOn: text("spent_on").notNull(),
    note: text("note"),
    recurringBillId: text("recurring_bill_id").references(() => recurringBills.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("expenses_spent_on_idx").on(t.spentOn),
    index("expenses_category_id_idx").on(t.categoryId),
    index("expenses_user_spent_on_idx").on(t.userId, t.spentOn),
    uniqueIndex("expenses_bill_due_unique").on(t.recurringBillId, t.spentOn),
  ],
);

export const income = sqliteTable(
  "income",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    amountCents: integer("amount_cents").notNull(),
    source: text("source").notNull(),
    receivedOn: text("received_on").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("income_received_on_idx").on(t.receivedOn), index("income_user_received_on_idx").on(t.userId, t.receivedOn)],
);

export const savingsGoals = sqliteTable(
  "savings_goals",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    targetCents: integer("target_cents").notNull(),
    targetDate: text("target_date"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("savings_goals_user_idx").on(t.userId)],
);

export const savingsContributions = sqliteTable(
  "savings_contributions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    goalId: text("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    onDate: text("on_date").notNull(),
    note: text("note"),
  },
  (t) => [index("savings_contributions_on_date_idx").on(t.onDate), index("savings_contributions_user_idx").on(t.userId)],
);

export const debts = sqliteTable(
  "debts",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    startingBalanceCents: integer("starting_balance_cents").notNull(),
    startedOn: text("started_on").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("debts_user_idx").on(t.userId)],
);

export const debtPayments = sqliteTable(
  "debt_payments",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    debtId: text("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    paidOn: text("paid_on").notNull(),
    note: text("note"),
  },
  (t) => [index("debt_payments_paid_on_idx").on(t.paidOn), index("debt_payments_user_idx").on(t.userId)],
);
