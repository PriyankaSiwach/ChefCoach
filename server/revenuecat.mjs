import { httpError } from "./http-error.mjs";

const RC_API_BASE = "https://api.revenuecat.com/v2";
const RC_TIMEOUT_MS = 8_000;

/**
 * REVENUECAT_SECRET_KEY must be a v2 secret key whose only permission is
 * "Customer information → Customers: Read only".
 * REVENUECAT_ENTITLEMENT_ID is RevenueCat's internal entitlement ID (e.g. "entl…"),
 * not the "pro" lookup key the app uses.
 */
export function revenueCatConfig(env = process.env) {
  return {
    secretKey: (env.REVENUECAT_SECRET_KEY || "").trim(),
    projectId: (env.REVENUECAT_PROJECT_ID || "").trim(),
    entitlementId: (env.REVENUECAT_ENTITLEMENT_ID || "").trim(),
  };
}

function unavailable() {
  return httpError(502, "Could not reach the subscription service. Try again.");
}

/**
 * Ask RevenueCat whether `userId` has the Pro entitlement right now. The app uses the
 * Supabase user ID as its RevenueCat appUserID, so the two IDs are the same.
 * Throws (502/503) whenever RevenueCat can't give a trustworthy answer, so callers change nothing.
 * @param {string} userId
 * @param {{ config?: ReturnType<typeof revenueCatConfig>, fetchImpl?: typeof fetch, now?: number }} [options]
 * @returns {Promise<{ isPro: boolean, expiresAt: string | null }>}
 */
export async function lookupRevenueCatPro(
  userId,
  { config = revenueCatConfig(), fetchImpl = fetch, now = Date.now() } = {}
) {
  const { secretKey, projectId, entitlementId } = config;
  if (!secretKey || !projectId || !entitlementId) {
    throw httpError(503, "Subscriptions are not configured.");
  }

  const url = `${RC_API_BASE}/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}`;

  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(RC_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }

  // RevenueCat has never seen this user: they have never bought or restored.
  if (res.status === 404) return { isPro: false, expiresAt: null };
  if (!res.ok) throw unavailable();

  let body;
  try {
    body = await res.json();
  } catch {
    throw unavailable();
  }

  const list = body?.active_entitlements;
  if (!list || !Array.isArray(list.items)) throw unavailable();

  const match = list.items.find(
    (item) =>
      item?.entitlement_id === entitlementId &&
      (item.expires_at == null || (typeof item.expires_at === "number" && item.expires_at > now))
  );

  if (!match) {
    // Pro might be on a page we didn't fetch; don't guess.
    if (list.next_page) throw unavailable();
    return { isPro: false, expiresAt: null };
  }

  return {
    isPro: true,
    expiresAt: typeof match.expires_at === "number" ? new Date(match.expires_at).toISOString() : null,
  };
}
