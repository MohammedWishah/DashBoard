import { z } from "zod";
import { MAX_ACTIVE_PROJECTS, normalizeName } from "./rules";
import { moneyExportSchema, type MoneyExport } from "./money-schemas";
import { plannerExportSchema, type PlannerExport } from "./planner-schemas";

export { MAX_ACTIVE_PROJECTS, normalizeName };

export const projectStatusSchema = z.enum(["active", "parked", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

const isoDateTime = z.iso.datetime({ offset: true });

const name = z.string().trim().min(1, "Name is required").max(120);
const nextAction = z.string().trim().min(1, "Next action is required").max(500);
const doneDefinition = z.string().trim().max(1000);
const note = z.string().trim().max(1000);

/** A project as stored and as returned by the API. */
export const projectSchema = z.object({
  id: z.string().min(1),
  name,
  status: projectStatusSchema,
  nextAction,
  doneDefinition,
  lastTouched: isoDateTime,
  createdAt: isoDateTime,
});
export type ProjectRecord = z.infer<typeof projectSchema>;

/** API responses add the derived `stale` flag. */
export type Project = ProjectRecord & { stale: boolean };

export const createProjectSchema = z.object({
  name,
  status: projectStatusSchema.default("parked"),
  nextAction,
  doneDefinition: doneDefinition.default(""),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name,
    status: projectStatusSchema,
    nextAction,
    doneDefinition,
  })
  .partial()
  .strict();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const shipProjectSchema = z.object({
  note: note.optional().nullable(),
});
export type ShipProjectInput = z.infer<typeof shipProjectSchema>;

export const shippedEventSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  note: z.string().nullable(),
  shippedAt: isoDateTime,
});
export type ShippedEvent = z.infer<typeof shippedEventSchema>;

export const settingsInputSchema = z.object({
  availableHoursThisWeek: z.number().min(0).max(168),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const SETTING_KEYS = {
  availableHoursThisWeek: "available_hours_this_week",
} as const;

export type Stats = {
  shippedThisWeek: number;
  availableHoursThisWeek: number | null;
  weekStartsAt: string;
};

export type ShipResult = { project: Project; event: ShippedEvent };

export const settingRowSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const exportBase = {
  exportedAt: isoDateTime,
  projects: z.array(projectSchema),
  shippedEvents: z.array(shippedEventSchema),
  settings: z.array(settingRowSchema),
};

/**
 * Full data dump. `GET /api/export` returns version 3.
 * `POST /api/import` accepts 3 (replaces everything), 2 (projects + money, planner untouched)
 * or 1 (projects only).
 */
export const exportSchema = z
  .discriminatedUnion("version", [
    z.object({ version: z.literal(1), ...exportBase }),
    z.object({ version: z.literal(2), ...exportBase, money: moneyExportSchema }),
    z.object({ version: z.literal(3), ...exportBase, money: moneyExportSchema, planner: plannerExportSchema }),
  ])
  .superRefine((data, ctx) => {
    if (data.version === 2 || data.version === 3) checkMoneyReferences(data.money, ctx);
    if (data.version === 3) checkPlannerReferences(data.planner, ctx);
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const [i, p] of data.projects.entries()) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["projects", i, "id"], message: `Duplicate project id "${p.id}"` });
      ids.add(p.id);
      const key = normalizeName(p.name);
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["projects", i, "name"], message: `Duplicate project name "${p.name}"` });
      names.add(key);
    }
    const active = data.projects.filter((p) => p.status === "active").length;
    if (active > MAX_ACTIVE_PROJECTS) {
      ctx.addIssue({ code: "custom", path: ["projects"], message: `At most ${MAX_ACTIVE_PROJECTS} projects can be active, found ${active}` });
    }
    const eventIds = new Set<string>();
    for (const [i, e] of data.shippedEvents.entries()) {
      if (eventIds.has(e.id)) ctx.addIssue({ code: "custom", path: ["shippedEvents", i, "id"], message: `Duplicate event id "${e.id}"` });
      eventIds.add(e.id);
      if (!ids.has(e.projectId)) {
        ctx.addIssue({ code: "custom", path: ["shippedEvents", i, "projectId"], message: `Unknown project id "${e.projectId}"` });
      }
    }
    const keys = new Set<string>();
    for (const [i, s] of data.settings.entries()) {
      if (keys.has(s.key)) ctx.addIssue({ code: "custom", path: ["settings", i, "key"], message: `Duplicate setting "${s.key}"` });
      keys.add(s.key);
    }
  });
export type ExportData = z.infer<typeof exportSchema>;

function checkMoneyReferences(m: MoneyExport, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path: ["money", ...path], message });
  const idsOf = (table: keyof MoneyExport) => {
    const seen = new Set<string>();
    for (const [i, row] of m[table].entries()) {
      if (seen.has(row.id)) issue([table, i, "id"], `Duplicate id "${row.id}" in ${table}`);
      seen.add(row.id);
    }
    return seen;
  };
  const categoryIds = idsOf("categories");
  const billIds = idsOf("recurringBills");
  const goalIds = idsOf("savingsGoals");
  const debtIds = idsOf("debts");
  idsOf("expenses");
  idsOf("income");
  idsOf("savingsContributions");
  idsOf("debtPayments");

  const names = new Set<string>();
  for (const [i, c] of m.categories.entries()) {
    const key = normalizeName(c.name);
    if (names.has(key)) issue(["categories", i, "name"], `Duplicate category name "${c.name}"`);
    names.add(key);
  }
  for (const [i, b] of m.recurringBills.entries()) {
    if (!categoryIds.has(b.categoryId)) issue(["recurringBills", i, "categoryId"], `Unknown category id "${b.categoryId}"`);
  }
  for (const [i, e] of m.expenses.entries()) {
    if (!categoryIds.has(e.categoryId)) issue(["expenses", i, "categoryId"], `Unknown category id "${e.categoryId}"`);
    if (e.recurringBillId && !billIds.has(e.recurringBillId)) {
      issue(["expenses", i, "recurringBillId"], `Unknown bill id "${e.recurringBillId}"`);
    }
  }
  for (const [i, c] of m.savingsContributions.entries()) {
    if (!goalIds.has(c.goalId)) issue(["savingsContributions", i, "goalId"], `Unknown goal id "${c.goalId}"`);
  }
  for (const [i, p] of m.debtPayments.entries()) {
    if (!debtIds.has(p.debtId)) issue(["debtPayments", i, "debtId"], `Unknown debt id "${p.debtId}"`);
  }
}

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

function checkPlannerReferences(p: PlannerExport, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path: ["planner", ...path], message });
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [i, h] of p.habits.entries()) {
    if (ids.has(h.id)) issue(["habits", i, "id"], `Duplicate habit id "${h.id}"`);
    ids.add(h.id);
    const key = normalizeName(h.name);
    if (names.has(key)) issue(["habits", i, "name"], `Duplicate habit name "${h.name}"`);
    names.add(key);
  }
  const checks = new Set<string>();
  for (const [i, c] of p.habitChecks.entries()) {
    if (!ids.has(c.habitId)) issue(["habitChecks", i, "habitId"], `Unknown habit id "${c.habitId}"`);
    const key = `${c.habitId}|${c.period}`;
    if (checks.has(key)) issue(["habitChecks", i], `Duplicate check for "${c.habitId}" on ${c.period}`);
    checks.add(key);
  }
  const taskIds = new Set<string>();
  const slots = new Set<string>();
  for (const [i, t] of p.dayTasks.entries()) {
    if (taskIds.has(t.id)) issue(["dayTasks", i, "id"], `Duplicate task id "${t.id}"`);
    taskIds.add(t.id);
    const slot = `${t.day}|${t.position}`;
    if (slots.has(slot)) issue(["dayTasks", i, "position"], `Two tasks in position ${t.position} on ${t.day}`);
    slots.add(slot);
  }
}
