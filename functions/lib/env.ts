import type { Extra, Feature } from "../../shared/features";

export type Bindings = {
  DB: D1Database;
  /** e.g. https://abcd1234.supabase.co (a var in wrangler.toml, not a secret) */
  SUPABASE_URL?: string;
  /** Only for legacy HS256 projects and local tests. New projects use JWKS. */
  SUPABASE_JWT_SECRET?: string;
  /** The person who owns the data from before multi-user. Claimed on first sign-in. */
  OWNER_EMAIL?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userId: string; email: string; isAdmin: boolean; features: Feature[]; extras: Extra[] };
};
