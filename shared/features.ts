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

/** Small optional helpers inside sections. Off by default, switched on per person (admin too). */
export const EXTRAS = ["home_today", "kind_streaks", "wins", "wants", "nudges"] as const;
export type Extra = (typeof EXTRAS)[number];

export const EXTRA_LABELS: Record<Extra, string> = {
  home_today: "Today on Home",
  kind_streaks: "Forgiving streaks",
  wins: "Wins",
  wants: "Want list",
  nudges: "Hermes nudges",
};

/** The section an extra lives in. It only works while that section is on. */
export const EXTRA_REQUIRES: Record<Extra, Feature | null> = {
  home_today: "planner",
  kind_streaks: "planner",
  wins: "planner",
  wants: "money",
  nudges: null,
};

export const isExtra = (v: unknown): v is Extra => typeof v === "string" && (EXTRAS as readonly string[]).includes(v);

/** Stored extras that can work right now, given the person's sections. */
export function effectiveExtras(stored: readonly string[], sections: readonly Feature[]): Extra[] {
  return EXTRAS.filter((e) => stored.includes(e) && (EXTRA_REQUIRES[e] === null || sections.includes(EXTRA_REQUIRES[e]!)));
}
