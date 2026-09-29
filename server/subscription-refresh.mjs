import { createClient } from "@supabase/supabase-js";
import { verifySupabaseAccessToken } from "./require-auth.mjs";
import { getAiIpLimiter, getAiUserLimiter } from "./rate-limit.mjs";
import { errorResponse, guardAiRequest } from "./ai-guards.mjs";
import { httpError } from "./http-error.mjs";
import { lookupRevenueCatPro } from "./revenuecat.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {{ is_pro: boolean, expires_at: string | null, source: "revenuecat" | "comp" | "legacy" }} SubscriptionRow
 * @typedef {{
 *   get: (userId: string) => Promise<SubscriptionRow | null>,
 *   save: (userId: string, row: SubscriptionRow) => Promise<void>,
 *   mirrorToProfile: (userId: string, status: { isPro: boolean, expiresAt: string | null }) => Promise<void>,
 * }} SubscriptionStore
 */

/** PRO_COMP_USER_IDS: Supabase user IDs separated by commas or spaces. Anything that isn't a UUID is ignored. */
export function parseCompUserIds(raw = process.env.PRO_COMP_USER_IDS) {
  return new Set(
    String(raw ?? "")
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter((id) => UUID_RE.test(id))
  );
}

function storeError() {
  return httpError(502, "Could not save subscription status. Try again.");
}

/**
 * Service-role access to `subscriptions` and the `profiles` mirror. The service role
 * bypasses RLS and the 006 trigger, so this must only ever run on the server.
 * @returns {SubscriptionStore | null} null when Supabase admin access is not configured.
 */
export function createSupabaseSubscriptionStore(env = process.env) {
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) return null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async get(userId) {
      const { data, error } = await admin
        .from("subscriptions")
        .select("is_pro, expires_at, source")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw storeError();
      return data;
    },
    async save(userId, row) {
      const { error } = await admin
        .from("subscriptions")
        .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw storeError();
    },
    // Old app versions read Pro from profile_data, so keep it in step with the real answer.
    async mirrorToProfile(userId, { isPro, expiresAt }) {
      const { data, error } = await admin
        .from("profiles")
        .select("profile_data")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) return;
      const pd = data.profile_data;
      const current = pd && typeof pd === "object" && !Array.isArray(pd) ? pd : {};
      await admin
        .from("profiles")
        .update({ profile_data: { ...current, isPro, subscriptionExpiresAt: expiresAt } })
        .eq("id", userId);
    },
  };
}

/** @param {SubscriptionRow} row */
function reply(row) {
  return {
    status: 200,
    json: { isPro: row.is_pro, expiresAt: row.expires_at, source: row.source },
  };
}

/**
 * @param {SubscriptionStore} store
 * @param {string} userId
 * @param {SubscriptionRow} row
 */
async function saveAndReply(store, userId, row) {
  await store.save(userId, row);
  try {
    await store.mirrorToProfile(userId, { isPro: row.is_pro, expiresAt: row.expires_at });
  } catch {
    /* the subscriptions row is the source of truth; the mirror is best-effort */
  }
  return reply(row);
}

/**
 * POST /api/subscription/refresh — re-check the caller's Pro status with RevenueCat
 * and store the answer. Per-IP limit → Supabase token → per-user limit (shared with AI routes).
 * @param {{ authorization?: string, ip?: string }} [req]
 * @param {{
 *   verifyUser?: typeof verifySupabaseAccessToken,
 *   userLimiter?: ReturnType<typeof getAiUserLimiter>,
 *   ipLimiter?: ReturnType<typeof getAiIpLimiter>,
 *   lookupPro?: (userId: string) => Promise<{ isPro: boolean, expiresAt: string | null }>,
 *   store?: SubscriptionStore | null,
 *   compUserIds?: Set<string>,
 *   now?: () => number,
 * }} [deps]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export async function handleSubscriptionRefreshRequest(
  { authorization, ip } = {},
  {
    verifyUser = verifySupabaseAccessToken,
    userLimiter = getAiUserLimiter(),
    ipLimiter = getAiIpLimiter(),
    lookupPro = lookupRevenueCatPro,
    store = createSupabaseSubscriptionStore(),
    compUserIds = parseCompUserIds(),
    now = Date.now,
  } = {}
) {
  const gate = await guardAiRequest({ authorization, ip }, { verifyUser, ipLimiter, userLimiter });
  if (!gate.ok) return gate.response;

  if (!store) {
    return { status: 503, json: { error: "Subscriptions are not configured." } };
  }

  const userId = gate.userId;
  try {
    if (compUserIds.has(userId.toLowerCase())) {
      return await saveAndReply(store, userId, { is_pro: true, expires_at: null, source: "comp" });
    }

    const rc = await lookupPro(userId);

    if (!rc.isPro) {
      // Keep the one-time legacy grant from migration 006 until it runs out.
      const current = await store.get(userId);
      const legacyExpiry = current?.expires_at ? Date.parse(current.expires_at) : NaN;
      if (current?.source === "legacy" && current.is_pro && legacyExpiry > now()) {
        return reply(current);
      }
    }

    return await saveAndReply(store, userId, {
      is_pro: rc.isPro,
      expires_at: rc.expiresAt,
      source: "revenuecat",
    });
  } catch (err) {
    return errorResponse(err, "Could not check your subscription. Try again.");
  }
}
