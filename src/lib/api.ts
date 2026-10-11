import type {
  ApiErrorBody,
  CreateProjectInput,
  ExportData,
  Project,
  SettingsInput,
  ShipResult,
  Stats,
  UpdateProjectInput,
} from "@shared/schemas";
import { guestFetch, isGuest } from "@/lib/guest";
import { accessToken, supabase } from "@/lib/supabase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const guest = isGuest();
  const token = guest ? null : await accessToken();
  const options: RequestInit = {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  };
  let res: Response;
  try {
    res = guest ? await guestFetch(path, options) : await fetch(`/api${path}`, options);
  } catch (err) {
    if (guest) console.error(err);
    throw guest
      ? new ApiError(0, "guest", "Guest mode could not start in this browser. Reload the page and try again.")
      : new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (res.status === 401 && !guest) {
    // The session is gone or no longer valid: back to the sign-in screen.
    void supabase?.auth.signOut();
  }
  if (!res.ok || body === null) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? "unknown", err?.message ?? `Request failed (${res.status})`);
  }
  return body;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  listProjects: () => request<{ projects: Project[] }>("/projects").then((r) => r.projects),
  createProject: (input: CreateProjectInput) =>
    request<{ project: Project }>("/projects", { method: "POST", body: json(input) }).then((r) => r.project),
  updateProject: (id: string, patch: UpdateProjectInput) =>
    request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: json(patch) }).then(
      (r) => r.project,
    ),
  shipProject: (id: string, note?: string | null) =>
    request<ShipResult>(`/projects/${encodeURIComponent(id)}/ship`, { method: "POST", body: json({ note: note || null }) }),
  getStats: () => request<Stats>("/stats"),
  putSettings: (input: SettingsInput) => request<Stats>("/settings", { method: "PUT", body: json(input) }),
  exportData: () => request<ExportData>("/export"),
  importData: (data: unknown) =>
    request<{ imported: { projects: number; shippedEvents: number; settings: number } }>("/import", {
      method: "POST",
      body: json(data),
    }),
};

export type AgentToken = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export const accountApi = {
  me: () => request<{ id: string; email: string }>("/me"),
  tokens: () => request<{ tokens: AgentToken[] }>("/agent-tokens").then((r) => r.tokens),
  createToken: (name: string) =>
    request<AgentToken & { token: string }>("/agent-tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revokeToken: (id: string) => request<{ ok: true }>(`/agent-tokens/${id}`, { method: "DELETE" }),
};
