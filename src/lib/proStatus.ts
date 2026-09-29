/**
 * Single place that decides whether to show Pro. Only two sources count:
 *   (a) the ChefCoach server's answer from POST /api/subscription/refresh
 *       (last answer cached per user so offline launches keep it until its expiry), or
 *   (b) the RevenueCat SDK reporting an active entitlement during this app session
 *       (kept in memory only, never persisted).
 * The profile's isPro, email addresses, and other local flags are never consulted.
 */

export const SUBSCRIPTION_CHANGED_EVENT = "recipify-subscription-changed";

const SERVER_STATUS_KEY = "chefcoach_server_pro_status";
const LEGACY_PRO_FLAG_KEY = "recipify_is_pro";

export type ServerProStatus = {
  userId: string;
  isPro: boolean;
  expiresAt: string | null;
  source: string;
  checkedAt: string;
};

type RevenueCatEntitlement = {
  userId: string | null;
  active: boolean;
  expiresAt: string | null;
};

let revenueCatEntitlement: RevenueCatEntitlement | null = null;

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT));
}

function notExpired(expiresAt: string | null, now: number): boolean {
  if (expiresAt === null) return true;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t > now;
}

export function readServerProStatus(): ServerProStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SERVER_STATUS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<ServerProStatus>;
    if (typeof s.userId !== "string" || typeof s.isPro !== "boolean") return null;
    return {
      userId: s.userId,
      isPro: s.isPro,
      expiresAt: typeof s.expiresAt === "string" ? s.expiresAt : null,
      source: typeof s.source === "string" ? s.source : "",
      checkedAt: typeof s.checkedAt === "string" ? s.checkedAt : "",
    };
  } catch {
    return null;
  }
}

/** Only subscription-api.ts calls this, with a 200 response from the server. */
export function saveServerProStatus(status: ServerProStatus): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SERVER_STATUS_KEY, JSON.stringify(status));
    window.localStorage.removeItem(LEGACY_PRO_FLAG_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function clearProStatus(): void {
  revenueCatEntitlement = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SERVER_STATUS_KEY);
      window.localStorage.removeItem(LEGACY_PRO_FLAG_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

/** Called with what the RevenueCat SDK reports (purchase, restore, logIn, getCustomerInfo). */
export function setRevenueCatEntitlement(entitlement: RevenueCatEntitlement | null): void {
  revenueCatEntitlement = entitlement;
  notify();
}

/**
 * @param userId Supabase user ID (or the local guest ID RevenueCat was configured with).
 */
export function isProActive(userId: string | null | undefined, now = Date.now()): boolean {
  const id = userId ?? null;

  const rc = revenueCatEntitlement;
  if (rc && rc.active && rc.userId === id && notExpired(rc.expiresAt, now)) return true;

  if (!id) return false;
  const server = readServerProStatus();
  return Boolean(server && server.userId === id && server.isPro && notExpired(server.expiresAt, now));
}
