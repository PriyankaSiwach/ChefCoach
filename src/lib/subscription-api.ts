/**
 * Asks the ChefCoach server to re-check Pro with RevenueCat (POST /api/subscription/refresh).
 * On success the answer is cached per user; on any failure the last answer is kept.
 */
import { apiUrl, BackendNotConfiguredError } from "@/lib/apiBase";
import { supabase } from "@/lib/supabaseClient";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { saveServerProStatus, type ServerProStatus } from "@/lib/proStatus";

const REFRESH_TIMEOUT_MS = 15_000;

export type SubscriptionRefreshResult =
  | { ok: true; status: ServerProStatus }
  | {
      ok: false;
      reason: "no_session" | "backend_not_configured" | "unreachable" | "server_error" | "bad_response";
      httpStatus?: number;
    };

async function currentSession(): Promise<{ token: string; userId: string } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    return s?.access_token && s.user?.id ? { token: s.access_token, userId: s.user.id } : null;
  } catch {
    return null;
  }
}

export async function refreshSubscriptionStatus(): Promise<SubscriptionRefreshResult> {
  const session = await currentSession();
  if (!session) return { ok: false, reason: "no_session" };

  let url: string;
  try {
    url = apiUrl("/api/subscription/refresh");
  } catch (e) {
    if (e instanceof BackendNotConfiguredError) return { ok: false, reason: "backend_not_configured" };
    throw e;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: "{}",
      timeoutMs: REFRESH_TIMEOUT_MS,
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (!res.ok) return { ok: false, reason: "server_error", httpStatus: res.status };

  let data: { isPro?: unknown; expiresAt?: unknown; source?: unknown };
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "bad_response", httpStatus: res.status };
  }
  if (typeof data?.isPro !== "boolean") return { ok: false, reason: "bad_response", httpStatus: res.status };

  const status: ServerProStatus = {
    userId: session.userId,
    isPro: data.isPro,
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    source: typeof data.source === "string" ? data.source : "",
    checkedAt: new Date().toISOString(),
  };
  saveServerProStatus(status);
  return { ok: true, status };
}
