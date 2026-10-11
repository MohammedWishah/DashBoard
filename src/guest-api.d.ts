// functions/lib/guest.ts, aliased in vite.config.ts. Declared here so the browser typecheck
// doesn't pull in server code that needs the Cloudflare types; functions/tsconfig.json checks the real file.
declare module "@guest-api" {
  import type { Database } from "sql.js";
  export function createGuestApi(db: Database): (req: Request) => Promise<Response>;
}
