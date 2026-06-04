import { supabase } from "@/lib/supabaseClient";
import { apiUrl } from "@/lib/apiBase";
import { classifyLoginAuthError, type AuthFailureKind } from "@/lib/authErrors";

const RPC_NAME = "check_email_registered";

function isRpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    msg.includes(RPC_NAME) ||
    msg.includes("could not find the function")
  );
}

/** Supabase RPC — works with anon key after migration 002. */
async function checkViaRpc(email: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc(RPC_NAME, { user_email: email });
  if (!error && typeof data === "boolean") return data;
  if (isRpcMissing(error)) return null;
  console.warn("[auth] check_email_registered RPC:", error?.message);
  return null;
}

/** Express API + service role — dev/production fallback. */
async function checkViaApi(email: string): Promise<boolean | null> {
  try {
    const res = await fetch(apiUrl("/api/auth/email-exists"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.status === 503) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { exists?: boolean };
    return typeof data.exists === "boolean" ? data.exists : null;
  } catch {
    return null;
  }
}

/**
 * Returns whether an auth user exists for this email.
 * null = lookup unavailable (run supabase/migrations/002_check_email_registered.sql).
 */
export async function checkEmailRegistered(email: string): Promise<boolean | null> {
  const addr = email.trim().toLowerCase();
  if (!addr) return null;

  const viaRpc = await checkViaRpc(addr);
  if (viaRpc !== null) return viaRpc;

  return checkViaApi(addr);
}

export async function resolveLoginFailureKind(
  errorMessage: string,
  errorCode: string | null | undefined,
  email: string,
  preCheckRegistered: boolean | null
): Promise<AuthFailureKind> {
  let kind = classifyLoginAuthError({ message: errorMessage, code: errorCode ?? undefined });

  if (kind !== "invalid_credentials") return kind;

  if (preCheckRegistered === false) return "account_not_found";
  if (preCheckRegistered === true) return "invalid_credentials";

  const again = await checkEmailRegistered(email);
  if (again === false) return "account_not_found";
  return "invalid_credentials";
}
