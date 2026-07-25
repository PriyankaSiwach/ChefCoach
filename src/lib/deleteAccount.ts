import { supabase } from "@/lib/supabaseClient";
import { apiUrl } from "@/lib/apiBase";
import { resolveAuthEmail } from "@/lib/trial";

const DELETE_RPC = "delete_own_account";
const CHECK_EMAIL_RPC = "check_email_registered";

function isRpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    msg.includes("could not find the function")
  );
}

async function emailRegisteredViaRpc(email: string): Promise<boolean | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase.rpc(CHECK_EMAIL_RPC, {
    user_email: normalized,
  });
  if (error) {
    if (isRpcMissing(error)) return null;
    console.warn("[deleteAccount] email RPC check:", error.message);
    return null;
  }
  return data === true;
}

async function emailRegisteredViaApi(email: string): Promise<boolean | null> {
  try {
    const res = await fetch(apiUrl("/api/auth/email-exists"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (res.status === 503) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { exists?: boolean };
    return data.exists === true;
  } catch {
    return null;
  }
}

/** Returns true if email still in auth, false if gone, null if unknown. */
async function isEmailStillRegistered(email: string): Promise<boolean | null> {
  const viaRpc = await emailRegisteredViaRpc(email);
  if (viaRpc !== null) return viaRpc;
  return emailRegisteredViaApi(email);
}

async function deleteViaRpc(): Promise<{ ok: boolean; error?: string; unavailable?: boolean }> {
  const { error } = await supabase.rpc(DELETE_RPC);
  if (!error) return { ok: true };
  if (isRpcMissing(error)) return { ok: false, unavailable: true };
  return { ok: false, error: error.message };
}

async function deleteViaApi(
  accessToken: string
): Promise<{ ok: boolean; error?: string; unavailable?: boolean }> {
  try {
    const res = await fetch(apiUrl("/api/auth/delete-account"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.status === 503) return { ok: false, unavailable: true };

    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Account deletion failed." };
    }
    return { ok: true };
  } catch {
    return { ok: false, unavailable: true };
  }
}

async function verifyEmailRemoved(email: string): Promise<{ ok: boolean; error?: string }> {
  const stillThere = await isEmailStillRegistered(email);
  if (stillThere === false) return { ok: true };
  if (stillThere === true) {
    return {
      ok: false,
      error:
        "Your email is still registered. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server, OR run supabase/migrations/005_delete_own_account.sql in Supabase SQL Editor.",
    };
  }

  const { error } = await supabase.auth.getUser();
  if (error) return { ok: true };

  return {
    ok: false,
    error: "Could not verify your account was deleted. Please try again.",
  };
}

const SETUP_HINT =
  "Account deletion is not configured. Do BOTH: (1) Add SUPABASE_SERVICE_ROLE_KEY to .env.local from Supabase → Settings → API, then restart npm run dev. (2) Run supabase/migrations/005_delete_own_account.sql in Supabase SQL Editor.";

/**
 * Permanently delete auth.users row + profile. Fails unless email is verified gone.
 */
export async function deleteSupabaseAccount(): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const userId = session?.user?.id;
  const email = session?.user ? resolveAuthEmail(session.user) : null;

  if (!session || !userId || !email) {
    return { ok: false, error: "You must be signed in to delete your account." };
  }

  let apiUnavailable = false;
  let rpcUnavailable = false;

  const apiResult = await deleteViaApi(session.access_token);
  if (apiResult.unavailable) {
    apiUnavailable = true;
  } else if (apiResult.ok) {
    const verified = await verifyEmailRemoved(email);
    if (verified.ok) return { ok: true };
  }

  const rpcResult = await deleteViaRpc();
  if (rpcResult.unavailable) {
    rpcUnavailable = true;
  } else if (rpcResult.ok) {
    const verified = await verifyEmailRemoved(email);
    if (verified.ok) return { ok: true };
  }

  if (apiUnavailable && rpcUnavailable) {
    return { ok: false, error: SETUP_HINT };
  }

  const stillThere = await isEmailStillRegistered(email);
  if (stillThere === true) {
    return {
      ok: false,
      error:
        "Your account was not removed from Supabase. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart, or run migration 005 in Supabase SQL Editor.",
    };
  }

  if (stillThere === false) return { ok: true };

  const apiErr = apiResult.error;
  const rpcErr = rpcResult.error;
  return {
    ok: false,
    error: apiErr || rpcErr || "Account deletion failed. Please try again.",
  };
}
