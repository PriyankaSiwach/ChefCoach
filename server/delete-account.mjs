import { createClient } from "@supabase/supabase-js";

function envConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  return { url: url.replace(/\/$/, ""), serviceKey };
}

/**
 * Delete profile row + auth user using service role (fallback when RPC is not deployed).
 * @param {string} accessToken
 */
export async function deleteAccountForToken(accessToken) {
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) {
    return { configured: true, ok: false, error: "Missing access token." };
  }

  const { url, serviceKey } = envConfig();
  if (!url || !serviceKey) {
    return { configured: false };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error: userError } = await admin.auth.getUser(token);
  const user = data?.user;
  if (userError || !user?.id) {
    return {
      configured: true,
      ok: false,
      error: userError?.message || "Invalid or expired session.",
    };
  }

  try {
    await admin.from("profiles").delete().eq("id", user.id);
  } catch {
    /* profile may already be gone */
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return { configured: true, ok: false, error: deleteError.message };
  }

  return { configured: true, ok: true };
}
