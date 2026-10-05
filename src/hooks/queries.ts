import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MAX_ACTIVE_PROJECTS } from "@shared/rules";
import type { CreateProjectInput, Project, Stats, UpdateProjectInput } from "@shared/schemas";
import { api } from "@/lib/api";

export const keys = {
  projects: ["projects"] as const,
  stats: ["stats"] as const,
};

export function useProjects(enabled = true) {
  return useQuery({ queryKey: keys.projects, queryFn: api.listProjects, enabled });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: api.getStats });
}

/** Snapshot a cache entry so an optimistic change can be rolled back. */
async function snapshot<T>(qc: QueryClient, key: readonly unknown[]) {
  await qc.cancelQueries({ queryKey: key });
  return qc.getQueryData<T>(key);
}

function reportError(err: Error) {
  toast.error(err.message);
}

/** Client-side mirror of the server rule, used to warn before a request is sent. */
export function activeSlotsLeft(projects: Project[] | undefined, exceptId?: string) {
  const active = (projects ?? []).filter((p) => p.status === "active" && p.id !== exceptId).length;
  return MAX_ACTIVE_PROJECTS - active;
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onMutate: async (input) => {
      const previous = await snapshot<Project[]>(qc, keys.projects);
      const now = new Date().toISOString();
      const optimistic: Project = {
        id: `temp-${crypto.randomUUID()}`,
        name: input.name.trim(),
        status: input.status ?? "parked",
        nextAction: input.nextAction.trim(),
        doneDefinition: input.doneDefinition?.trim() ?? "",
        lastTouched: now,
        createdAt: now,
        stale: false,
      };
      qc.setQueryData<Project[]>(keys.projects, (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _input, ctx) => qc.setQueryData(keys.projects, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) => api.updateProject(id, patch),
    onMutate: async ({ id, patch }) => {
      const previous = await snapshot<Project[]>(qc, keys.projects);
      const now = new Date().toISOString();
      qc.setQueryData<Project[]>(keys.projects, (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...patch, lastTouched: now, stale: false } : p)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(keys.projects, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useShipProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) => api.shipProject(id, note),
    onMutate: async ({ id }) => {
      const previousProjects = await snapshot<Project[]>(qc, keys.projects);
      const previousStats = await snapshot<Stats>(qc, keys.stats);
      const now = new Date().toISOString();
      qc.setQueryData<Project[]>(keys.projects, (old) =>
        old?.map((p) => (p.id === id ? { ...p, lastTouched: now, stale: false } : p)),
      );
      qc.setQueryData<Stats>(keys.stats, (old) => old && { ...old, shippedThisWeek: old.shippedThisWeek + 1 });
      return { previousProjects, previousStats };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(keys.projects, ctx?.previousProjects);
      qc.setQueryData(keys.stats, ctx?.previousStats);
      reportError(err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useSaveHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hours: number) => api.putSettings({ availableHoursThisWeek: hours }),
    onMutate: async (hours) => {
      const previous = await snapshot<Stats>(qc, keys.stats);
      qc.setQueryData<Stats>(keys.stats, (old) => old && { ...old, availableHoursThisWeek: hours });
      return { previous };
    },
    onError: (err, _hours, ctx) => {
      qc.setQueryData(keys.stats, ctx?.previous);
      reportError(err);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.stats }),
  });
}

export function useImportData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.importData(data),
    onSettled: () => qc.invalidateQueries(),
  });
}

export type ReviewAnswer = {
  id: string;
  status: Project["status"];
  nextAction: string;
  shipped: boolean;
  note: string;
};

/**
 * Commits a weekly review in one go. Each reviewed project is patched
 * (which counts as touching it) and shipped events are recorded.
 */
export function useSaveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answers: ReviewAnswer[]) => {
      // Parking first frees active slots before anything else is saved.
      const ordered = [...answers].sort((a, b) => Number(a.status === "active") - Number(b.status === "active"));
      for (const a of ordered) {
        if (a.shipped) await api.shipProject(a.id, a.note);
        await api.updateProject(a.id, { status: a.status, nextAction: a.nextAction });
      }
    },
    onMutate: async (answers) => {
      const previousProjects = await snapshot<Project[]>(qc, keys.projects);
      const previousStats = await snapshot<Stats>(qc, keys.stats);
      const now = new Date().toISOString();
      const byId = new Map(answers.map((a) => [a.id, a]));
      qc.setQueryData<Project[]>(keys.projects, (old) =>
        old?.map((p) => {
          const a = byId.get(p.id);
          return a ? { ...p, status: a.status, nextAction: a.nextAction, lastTouched: now, stale: false } : p;
        }),
      );
      const shipped = answers.filter((a) => a.shipped).length;
      qc.setQueryData<Stats>(keys.stats, (old) => old && { ...old, shippedThisWeek: old.shippedThisWeek + shipped });
      return { previousProjects, previousStats };
    },
    onError: (err, _answers, ctx) => {
      qc.setQueryData(keys.projects, ctx?.previousProjects);
      qc.setQueryData(keys.stats, ctx?.previousStats);
      reportError(err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}
