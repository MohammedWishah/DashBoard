import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from "jose";
import { ApiError } from "../errors";
import type { Bindings } from "../env";

// One JWKS fetcher per project URL, kept for the life of the isolate. jose caches
// the keys and refetches when Supabase rotates them.
const jwksByUrl = new Map<string, JWTVerifyGetKey>();

function jwksFor(supabaseUrl: string): JWTVerifyGetKey {
  let jwks = jwksByUrl.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksByUrl.set(supabaseUrl, jwks);
  }
  return jwks;
}

const unauthorized = (message = "Sign in again") => new ApiError(401, "unauthorized", message);

/**
 * Verifies a Supabase access token and returns who it belongs to.
 * Asymmetric tokens (ES256/RS256) are checked against the project's public keys.
 * HS256 is accepted only when SUPABASE_JWT_SECRET is configured.
 */
export async function verifySupabaseToken(token: string, env: Bindings): Promise<{ userId: string; email: string }> {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) throw new ApiError(500, "auth_not_configured", "SUPABASE_URL is not set");

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw unauthorized();
  }

  const options = { issuer: `${supabaseUrl}/auth/v1`, audience: "authenticated" };
  try {
    const { payload } =
      alg === "HS256"
        ? env.SUPABASE_JWT_SECRET
          ? await jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), { ...options, algorithms: ["HS256"] })
          : (() => {
              throw unauthorized();
            })()
        : await jwtVerify(token, jwksFor(supabaseUrl), { ...options, algorithms: ["ES256", "RS256"] });

    const email = typeof payload.email === "string" ? payload.email : "";
    if (!payload.sub || !email) throw unauthorized();
    return { userId: payload.sub, email };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw unauthorized();
  }
}
