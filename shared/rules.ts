// Plain values shared by API and UI. Kept free of zod so the frontend
// bundle doesn't pull in the schema library just for a constant.

export const MAX_ACTIVE_PROJECTS = 2;

/** Case- and whitespace-insensitive key for matching spoken project names. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}
