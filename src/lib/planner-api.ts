import type { DayTaskRow, DayView, HabitCreate, HabitRow, HabitUpdate, MonthView } from "@shared/planner-schemas";
import { request } from "@/lib/api";

const json = (data: unknown) => JSON.stringify(data);

export const plannerApi = {
  day: (date: string) => request<DayView>(`/planner/day?date=${date}`),
  month: (month: string) => request<MonthView>(`/planner/month?month=${month}`),
  habits: () => request<{ habits: HabitRow[] }>("/planner/habits").then((r) => r.habits),
  createHabit: (input: HabitCreate) =>
    request<{ habit: HabitRow }>("/planner/habits", { method: "POST", body: json(input) }).then((r) => r.habit),
  updateHabit: (id: string, patch: HabitUpdate) =>
    request<{ habit: HabitRow }>(`/planner/habits/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.habit),
  deleteHabit: (id: string) => request<{ ok: true }>(`/planner/habits/${id}`, { method: "DELETE" }),
  tick: (habitId: string, period: string) => request(`/planner/habits/${habitId}/checks/${period}`, { method: "PUT" }),
  untick: (habitId: string, period: string) => request(`/planner/habits/${habitId}/checks/${period}`, { method: "DELETE" }),
  putTasks: (date: string, tasks: { text: string; done: boolean }[]) =>
    request<{ tasks: DayTaskRow[] }>(`/planner/day/${date}/tasks`, { method: "PUT", body: json({ tasks }) }).then((r) => r.tasks),
};
