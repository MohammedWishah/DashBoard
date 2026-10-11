import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from db/schema.ts.
// Wrangler applies them (see docs/SETUP.md), so no credentials are needed here.
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
});
