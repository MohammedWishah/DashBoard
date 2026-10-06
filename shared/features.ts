// Sections of the app that can be switched on per person. Plain values only (no zod)
// so the frontend can import them cheaply.

export const FEATURES = ["money", "planner", "projects"] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  money: "Money",
  planner: "Planner",
  projects: "Projects",
};

/** What a new person gets. Everything else is the admin's until granted. */
export const DEFAULT_FEATURES: Feature[] = ["money", "planner"];

/** Sections that exist in the app yet; the rest show as "coming soon" in the admin page. */
export const BUILT_FEATURES: Feature[] = ["money", "planner", "projects"];

export const isFeature = (v: unknown): v is Feature => typeof v === "string" && (FEATURES as readonly string[]).includes(v);

/** The admin always has everything; others have what's stored for them. */
export function effectiveFeatures(isAdmin: boolean, stored: readonly string[]): Feature[] {
  return isAdmin ? [...FEATURES] : FEATURES.filter((f) => stored.includes(f));
}
