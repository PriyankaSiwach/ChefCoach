import { createClient } from "@supabase/supabase-js";
import { createSupabaseSubscriptionStore, parseCompUserIds } from "./subscription-refresh.mjs";
import { lookupRevenueCatPro } from "./revenuecat.mjs";

/** Same free allowance the app has always shown: counted separately per kind. */
export const FREE_SCAN_LIMITS = Object.freeze({ cook: 3, track: 3 });

/**
 * @typedef {"cook" | "track"} ScanKind
 * @typedef {{ pro: true } | { pro: false, used: number }} QuotaStatus
 * @typedef {{
 *   check: (userId: string, kind: ScanKind) => Promise<QuotaStatus>,
 *   confirmPro: (userId: string) => Promise<boolean>,
 *   record: (userId: string, kind: ScanKind) => Promise<void>,
 *   runExclusive: <T>(key: string, fn: () => Promise<T>) => Promise<T>,
 * }} ScanQuota
 * @typedef {{ status: number, headers?: Record<string, string>, json: any }} HandlerResponse
 */

class QuotaUnavailableError extends Error {}

function unavailable() {
  return {
    status: 503,
    headers: { "Retry-After": "30" },
    json: { error: "Can't check your free scans right now. Please try again shortly." },
  };
}

/** @param {ScanKind} kind */
function freeScansUsed(kind) {
  const label = kind === "cook" ? "Cook" : "Track";
  return {
    status: 402,
    json: {
      error: `You've used your ${FREE_SCAN_LIMITS[kind]} free ${label} scans. Upgrade to Pro for unlimited scans.`,
      code: "free_scans_used",
      kind,
      limit: FREE_SCAN_LIMITS[kind],
    },
  };
}

/**
 * Runs one task at a time per key. Only one API instance runs today; with several,
 * two instances could each let one request through at the same moment.
 */
export function createKeyedLock() {
  /** @type {Map<string, Promise<void>>} */
  const tails = new Map();
  /**
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  return async function runExclusive(key, fn) {
    const prev = tails.get(key) ?? Promise.resolve();
    /** @type {() => void} */
    let release = () => {};
    const current = new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    const tail = prev.then(() => current);
    tails.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}

/** Service-role reads/writes of public.scan_usage. Returns null when not configured. */
export function createSupabaseScanUsageStore(env = process.env) {
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) return null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    /** @param {string} userId @param {ScanKind} kind */
    async get(userId, kind) {
      const { data, error } = await admin
        .from("scan_usage")
        .select("used")
        .eq("user_id", userId)
        .eq("kind", kind)
        .maybeSingle();
      if (error) throw new QuotaUnavailableError();
      return typeof data?.used === "number" ? data.used : 0;
    },
    /** @param {string} userId @param {ScanKind} kind */
    async increment(userId, kind) {
      const { error } = await admin.rpc("record_scan_usage", { p_user_id: userId, p_kind: kind });
      if (error) throw new QuotaUnavailableError();
    },
  };
}

/**
 * @param {{
 *   subscriptions?: ReturnType<typeof createSupabaseSubscriptionStore>,
 *   usage?: ReturnType<typeof createSupabaseScanUsageStore>,
 *   lookupPro?: (userId: string) => Promise<{ isPro: boolean, expiresAt: string | null }>,
 *   compUserIds?: Set<string>,
 *   now?: () => number,
 * }} [deps]
 * @returns {ScanQuota}
 */
export function createScanQuota({
  subscriptions = createSupabaseSubscriptionStore(),
  usage = createSupabaseScanUsageStore(),
  lookupPro = lookupRevenueCatPro,
  compUserIds = parseCompUserIds(),
  now = Date.now,
} = {}) {
  return {
    async check(userId, kind) {
      if (compUserIds.has(userId.toLowerCase())) return { pro: true };
      if (!subscriptions || !usage) throw new QuotaUnavailableError();

      let row;
      try {
        row = await subscriptions.get(userId);
      } catch {
        throw new QuotaUnavailableError();
      }
      const expiry = row?.expires_at ? Date.parse(row.expires_at) : null;
      if (row?.is_pro && (expiry === null || expiry > now())) return { pro: true };

      return { pro: false, used: await usage.get(userId, kind) };
    },

    // Last chance before a 402: the subscriptions row may be stale right after a purchase.
    async confirmPro(userId) {
      if (!subscriptions) return false;
      try {
        const rc = await lookupPro(userId);
        if (!rc.isPro) return false;
        await subscriptions.save(userId, { is_pro: true, expires_at: rc.expiresAt, source: "revenuecat" });
        return true;
      } catch {
        return false;
      }
    },

    async record(userId, kind) {
      if (!usage) throw new QuotaUnavailableError();
      await usage.increment(userId, kind);
    },

    runExclusive: createKeyedLock(),
  };
}

/** @type {ScanQuota | undefined} */
let defaultQuota;
export function getScanQuota() {
  if (!defaultQuota) defaultQuota = createScanQuota();
  return defaultQuota;
}

/**
 * Free-scan gate around one OpenAI-backed request.
 *   Pro (subscriptions row, comp list, or a live RevenueCat check) → never blocked, never counted.
 *   Free and out of scans → 402 before `run` is called.
 *   Database unreachable → 503; never free access.
 *   `counted` requests add 1 only after `run` succeeds, one at a time per user and kind.
 * @template T
 * @param {{ userId: string, kind: ScanKind, counted: boolean }} scan
 * @param {ScanQuota} quota
 * @param {() => Promise<T>} run
 * @returns {Promise<{ ok: true, value: T } | { ok: false, response: HandlerResponse }>}
 */
export async function runWithScanQuota({ userId, kind, counted }, quota, run) {
  /** @returns {Promise<{ ok: true, value: T } | { ok: false, response: HandlerResponse }>} */
  const attempt = async (/** @type {QuotaStatus} */ status) => {
    if (status.pro) return { ok: true, value: await run() };

    if (status.used >= FREE_SCAN_LIMITS[kind]) {
      if (!(await quota.confirmPro(userId))) return { ok: false, response: freeScansUsed(kind) };
      return { ok: true, value: await run() };
    }

    const value = await run();
    if (counted) {
      try {
        await quota.record(userId, kind);
      } catch {
        /* the scan was already delivered; don't fail it because the +1 couldn't be saved */
      }
    }
    return { ok: true, value };
  };

  const check = async () => {
    try {
      return await quota.check(userId, kind);
    } catch {
      return null;
    }
  };

  const first = await check();
  if (!first) return { ok: false, response: unavailable() };
  if (first.pro || !counted) return attempt(first);

  // Re-read inside the lock so two requests at once can't both use the last free scan.
  return quota.runExclusive(`${userId}:${kind}`, async () => {
    const status = await check();
    if (!status) return { ok: false, response: unavailable() };
    return attempt(status);
  });
}
