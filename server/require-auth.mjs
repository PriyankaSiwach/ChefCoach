import { createClient } from "@supabase/supabase-js";

export function getBearerToken(authorization) {
  if (typeof authorization !== "string") return "";
  const match = authorization.match(/^Bearer\s+(\S+)/i);
  return match ? match[1].trim() : "";
}

function supabaseAuthConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

/**
 * Verify a Supabase access token (JWT). Uses the anon key only — no service role.
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, status: number, error: string }>}
 */
export async function verifySupabaseAccessToken(token) {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    return { ok: false, status: 401, error: "Sign in required to generate recipes." };
  }

  const { url, anonKey } = supabaseAuthConfig();
  if (!url || !anonKey) {
    return { ok: false, status: 503, error: "Auth is not configured." };
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(trimmed);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  return { ok: true, userId: data.user.id };
}
