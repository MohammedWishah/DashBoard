import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * What brought the user here, read before supabase-js consumes the URL hash.
 * Invite and password-reset links land with `#...&type=invite|recovery`.
 */
export const arrivedVia: "invite" | "recovery" | null = (() => {
  const type = new URLSearchParams(window.location.hash.slice(1)).get("type");
  return type === "invite" || type === "recovery" ? type : null;
})();

export const authConfigured = Boolean(url && key);

// Only used for sign in, sign out and passwords. All app data goes through /api.
export const supabase: SupabaseClient | null = authConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Current access token, refreshed by supabase-js when it is about to expire. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
