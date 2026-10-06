import { z } from "zod";
import { dateSchema } from "./money-schemas";
import { ENERGY_LEVELS, type EnergyLevel } from "./energy";
import { FREQUENCIES, MAX_DAY_TASKS, TIMES_OF_DAY, type Frequency, type TimeOfDay } from "./planner";

export const frequencySchema = z.enum(FREQUENCIES);
const habitName = z.string().trim().min(1, "Name is required").max(80);
const taskText = z.string().trim().min(1, "Write something").max(200);

// ---- Inputs ---------------------------------------------------------------

/** "" clears it. */
const tiny = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v));
export const habitCreateSchema = z.object({ name: habitName, frequency: frequencySchema, tiny, timeOfDay: z.enum(TIMES_OF_DAY).default("any") });
export const habitUpdateSchema = z
  .object({ name: habitName, sortOrder: z.number().int().min(0), archived: z.boolean(), tiny, timeOfDay: z.enum(TIMES_OF_DAY) })
  .partial()
  .strict();
export const habitOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(110) });
export const energyPutSchema = z.object({ level: z.enum(ENERGY_LEVELS) });
export const agentEnergySchema = z.object({ level: z.enum(ENERGY_LEVELS), date: dateSchema.optional() });
export const dayTasksPutSchema = z.object({
  tasks: z.array(z.object({ text: taskText, done: z.boolean().default(false) })).max(MAX_DAY_TASKS, `At most ${MAX_DAY_TASKS} tasks`),
});
export const taskUpdateSchema = z.object({ text: taskText, done: z.boolean() }).partial().strict();
export const dayQuerySchema = z.object({ date: dateSchema.optional() });
export const weekQuerySchema = z.object({ week: dateSchema.optional() });

export const agentHabitCheckSchema = z.object({ habit: habitName, date: dateSchema.optional() });
export const agentTasksSchema = z.object({
  tasks: z.array(taskText).min(1, "Give at least one task").max(MAX_DAY_TASKS, `At most ${MAX_DAY_TASKS} tasks`),
  date: dateSchema.optional(),
});
export const agentTaskDoneSchema = z.object({ task: taskText, date: dateSchema.optional() });

export type HabitCreate = z.infer<typeof habitCreateSchema>;
export type HabitCreateInput = z.input<typeof habitCreateSchema>;
export type HabitUpdate = z.infer<typeof habitUpdateSchema>;
export type DayTasksPut = z.input<typeof dayTasksPutSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

// ---- Rows and views ---------------------------------------------------------

export type HabitRow = {
  id: string;
  name: string;
  frequency: Frequency;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  tiny: string | null;
  timeOfDay: TimeOfDay;
  archivedAt: string | null;
};
export type DayTaskRow = { id: string; day: string; position: number; text: string; done: boolean; createdAt: string };

export type DayHabit = HabitRow & { checked: boolean; streak: number; total: number | null; atRisk: boolean };
export type DayView = {
  date: string;
  today: string;
  tasks: DayTaskRow[];
  habits: { daily: DayHabit[]; weekly: DayHabit[]; monthly: DayHabit[] };
  /** null when the Energy check-in extra is off or nothing is logged */
  energy: EnergyLevel | null;
};

export type MonthDailyRow = { habit: HabitRow; checks: string[]; percent: number | null; streak: number; total: number | null; atRisk: boolean };
export type MonthWeeklyRow = {
  habit: HabitRow;
  weeks: { monday: string; checked: boolean }[];
  percent: number | null;
  streak: number;
  total: number | null;
  atRisk: boolean;
};
export type MonthMonthlyRow = { habit: HabitRow; checked: boolean; total: number | null };
export type TopHabit = { id: string; name: string; frequency: "daily" | "weekly"; percent: number | null; streak: number };
export type MonthView = {
  month: string;
  today: string;
  days: string[];
  mondays: string[];
  daily: MonthDailyRow[];
  dayPercents: { date: string; percent: number | null }[];
  weekly: MonthWeeklyRow[];
  monthly: MonthMonthlyRow[];
  top: TopHabit[];
};

// ---- Export -----------------------------------------------------------------

const isoDateTime = z.iso.datetime({ offset: true });
export const plannerExportSchema = z.object({
  habits: z.array(
    z.object({
      id: z.string().min(1),
      name: habitName,
      frequency: frequencySchema,
      sortOrder: z.number().int().min(0),
      archived: z.boolean(),
      createdAt: isoDateTime,
      // Optional so files exported before these existed still import.
      tiny: z.string().max(80).nullable().optional(),
      timeOfDay: z.enum(TIMES_OF_DAY).optional(),
      archivedAt: isoDateTime.nullable().optional(),
    }),
  ),
  habitChecks: z.array(z.object({ habitId: z.string().min(1), period: dateSchema, createdAt: isoDateTime })),
  dayTasks: z.array(
    z.object({
      id: z.string().min(1),
      day: dateSchema,
      position: z.number().int().min(1).max(MAX_DAY_TASKS),
      text: taskText,
      done: z.boolean(),
      createdAt: isoDateTime,
    }),
  ),
  energy: z.array(z.object({ day: dateSchema, level: z.enum(ENERGY_LEVELS), updatedAt: isoDateTime })).optional(),
});
export type PlannerExport = z.infer<typeof plannerExportSchema>;
