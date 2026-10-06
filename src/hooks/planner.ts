import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { periodFor, type Frequency } from "@shared/planner";
import type { DayView, MonthView } from "@shared/planner-schemas";
import { plannerApi } from "@/lib/planner-api";

export const plannerKeys = {
  all: ["planner"] as const,
  day: (date: string) => ["planner", "day", date] as const,
  month: (month: string) => ["planner", "month", month] as const,
  habits: ["planner", "habits"] as const,
};

export const useDay = (date: string) =>
  useQuery({ queryKey: plannerKeys.day(date), queryFn: () => plannerApi.day(date), placeholderData: keepPreviousData });

export const useMonth = (month: string) =>
  useQuery({ queryKey: plannerKeys.month(month), queryFn: () => plannerApi.month(month), placeholderData: keepPreviousData });

export const useHabits = () => useQuery({ queryKey: plannerKeys.habits, queryFn: plannerApi.habits });

type Toggle = { habitId: string; frequency: Frequency; date: string; checked: boolean };

/** Ticks or unticks a habit for the period containing `date`, updating every cached view first. */
export function useToggleCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, frequency, date, checked }: Toggle) => {
      const period = periodFor(frequency, date);
      return checked ? plannerApi.tick(habitId, period) : plannerApi.untick(habitId, period);
    },
    onMutate: async ({ habitId, frequency, date, checked }: Toggle) => {
      await qc.cancelQueries({ queryKey: plannerKeys.all });
      const period = periodFor(frequency, date);
      const snapshot = qc.getQueriesData({ queryKey: plannerKeys.all });
      qc.setQueriesData<DayView>({ queryKey: ["planner", "day"] }, (d) => {
        if (!d || periodFor(frequency, d.date) !== period) return d;
        const flip = (list: DayView["habits"]["daily"]) => list.map((h) => (h.id === habitId ? { ...h, checked } : h));
        return { ...d, habits: { daily: flip(d.habits.daily), weekly: flip(d.habits.weekly), monthly: flip(d.habits.monthly) } };
      });
      qc.setQueriesData<MonthView>({ queryKey: ["planner", "month"] }, (m) => {
        if (!m) return m;
        return {
          ...m,
          daily: m.daily.map((r) =>
            r.habit.id !== habitId ? r : { ...r, checks: checked ? [...new Set([...r.checks, period])] : r.checks.filter((c) => c !== period) },
          ),
          weekly: m.weekly.map((r) =>
            r.habit.id !== habitId ? r : { ...r, weeks: r.weeks.map((w) => (w.monday === period ? { ...w, checked } : w)) },
          ),
          monthly: m.monthly.map((r) => (r.habit.id === habitId && `${m.month}-01` === period ? { ...r, checked } : r)),
        };
      });
      return { snapshot };
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(err.message);
    },
    // Percentages and streaks come from the server.
    onSettled: () => qc.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}

export function useSaveTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, tasks }: { date: string; tasks: { text: string; done: boolean }[] }) => plannerApi.putTasks(date, tasks),
    onSuccess: (tasks, { date }) => qc.setQueryData<DayView>(plannerKeys.day(date), (d) => (d ? { ...d, tasks } : d)),
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean; date: string }) => plannerApi.updateTask(id, { done }),
    onMutate: async ({ id, done, date }) => {
      await qc.cancelQueries({ queryKey: plannerKeys.day(date) });
      const previous = qc.getQueryData<DayView>(plannerKeys.day(date));
      qc.setQueryData<DayView>(plannerKeys.day(date), (d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done } : t)) } : d));
      return { previous };
    },
    onError: (err, { date }, ctx) => {
      if (ctx?.previous) qc.setQueryData(plannerKeys.day(date), ctx.previous);
      toast.error(err.message);
    },
  });
}

/** For the manage dialog: no optimistic edit, just refresh everything planner-related. */
export function usePlannerAction<V>(fn: (v: V) => Promise<unknown>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => success && toast.success(success),
    onError: (err) => toast.error(err.message),
    onSettled: () => qc.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
