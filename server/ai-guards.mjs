import { getBearerToken } from "./require-auth.mjs";

function tooManyRequests(retryAfterMs) {
  return {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
    json: { error: "Too many requests, try again shortly." },
  };
}

/**
 * Shared gate for every endpoint that can reach OpenAI:
 * per-IP limit → Supabase token check → per-user limit.
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, response: { status: number, headers?: Record<string, string>, json: { error: string } } }>}
 */
export async function guardAiRequest({ authorization, ip }, { verifyUser, ipLimiter, userLimiter }) {
  const ipLimit = ipLimiter.check(ip || "unknown");
  if (!ipLimit.allowed) {
    return { ok: false, response: tooManyRequests(ipLimit.retryAfterMs) };
  }

  const auth = await verifyUser(getBearerToken(authorization));
  if (!auth.ok) {
    return { ok: false, response: { status: auth.status, json: { error: auth.error } } };
  }

  const userLimit = userLimiter.check(auth.userId);
  if (!userLimit.allowed) {
    return { ok: false, response: tooManyRequests(userLimit.retryAfterMs) };
  }

  return { ok: true, userId: auth.userId };
}

/** Map a thrown httpError into a handler response, keeping any headers (e.g. Retry-After). */
export function errorResponse(err, fallbackMessage) {
  /** @type {{ status: number, headers?: Record<string, string>, json: { error: string } }} */
  const out = {
    status: err?.statusCode ?? 502,
    json: { error: err?.message || fallbackMessage },
  };
  if (err?.headers) out.headers = err.headers;
  return out;
}
