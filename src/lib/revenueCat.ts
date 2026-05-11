import { Capacitor } from "@capacitor/core";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { RevenueCatUI, PAYWALL_RESULT } from "@revenuecat/purchases-capacitor-ui";

const ENTITLEMENT_ID =
  (import.meta.env.VITE_REVENUECAT_ENTITLEMENT_ID as string | undefined)?.trim() || "pro";

/** RevenueCat entitlement id (e.g. `pro`) — matches dashboard & `customerInfo.entitlements.active[id]`. */
export function getRevenueCatEntitlementId(): string {
  return ENTITLEMENT_ID;
}

let configured = false;

export function isRevenueCatPurchasePlatform(): boolean {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android";
}

/**
 * Call once at app root on launch (before or alongside auth).
 * Sets SDK log level in development, then `Purchases.configure` with the platform API key if not already configured.
 * When the user signs in, {@link syncRevenueCatUser} will `logIn` with the Supabase id without re-configuring.
 */
export async function initializeRevenueCatSdkOnLaunch(): Promise<void> {
  if (!isRevenueCatPurchasePlatform()) return;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return;
  try {
    if (import.meta.env.DEV) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    }
    if (!configured) {
      await Purchases.configure({ apiKey });
      configured = true;
    }
  } catch {
    /* ignore */
  }
}

function apiKeyForPlatform(): string | null {
  const p = Capacitor.getPlatform();
  if (p === "ios") {
    const k = (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined)?.trim();
    return k || null;
  }
  if (p === "android") {
    const k = (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string | undefined)?.trim();
    return k || null;
  }
  return null;
}

/** True if the configured entitlement is in `entitlements.active` (same as `typeof active[id] !== "undefined"` + active). */
export function entitlementActive(info: CustomerInfo): boolean {
  const active = info.entitlements?.active;
  if (!active || typeof active[ENTITLEMENT_ID] === "undefined") return false;
  return Boolean(active[ENTITLEMENT_ID]?.isActive);
}

export function applyProFromCustomerInfo(customerInfo: CustomerInfo): void {
  if (typeof window === "undefined") return;
  try {
    if (entitlementActive(customerInfo)) {
      window.localStorage.setItem("recipify_is_pro", "true");
    } else {
      window.localStorage.removeItem("recipify_is_pro");
    }
    window.dispatchEvent(new CustomEvent("recipify-subscription-changed"));
  } catch {
    /* ignore */
  }
}

async function ensurePurchasesReady(appUserId: string | null): Promise<boolean> {
  if (!isRevenueCatPurchasePlatform()) return false;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return false;

  if (!configured) {
    await Purchases.configure({
      apiKey,
      appUserID: appUserId ?? undefined,
    });
    configured = true;
  } else if (appUserId) {
    const { customerInfo } = await Purchases.logIn({ appUserID: appUserId });
    applyProFromCustomerInfo(customerInfo);
  }
  return true;
}

/**
 * Configure RevenueCat (once) and associate the Supabase user id.
 * No-op on web / missing API key.
 */
export async function syncRevenueCatUser(appUserId: string | null): Promise<void> {
  const ok = await ensurePurchasesReady(appUserId);
  if (!ok) return;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    applyProFromCustomerInfo(customerInfo);
  } catch {
    /* ignore */
  }
}

export async function refreshProFromRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    applyProFromCustomerInfo(customerInfo);
  } catch {
    /* ignore */
  }
}

export async function revenueCatLogOut(): Promise<void> {
  if (!configured) return;
  try {
    const { customerInfo } = await Purchases.logOut();
    applyProFromCustomerInfo(customerInfo);
  } catch {
    /* ignore */
  } finally {
    configured = false;
  }
}

export type PurchaseProResult =
  | { ok: true }
  | { ok: false; error: string; userCancelled?: boolean };

/**
 * Presents the RevenueCat dashboard paywall (`RevenueCatUI.presentPaywall`), then refreshes
 * `Purchases.getCustomerInfo()` and syncs `recipify_is_pro` from {@link getRevenueCatEntitlementId}.
 */
export async function presentRevenueCatPaywall(appUserId: string | null): Promise<PurchaseProResult> {
  if (!isRevenueCatPurchasePlatform()) {
    return {
      ok: false,
      error: "Subscribe in the Recipify iOS app with your Apple ID to unlock Pro.",
    };
  }
  const apiKey = apiKeyForPlatform();
  if (!apiKey) {
    return { ok: false, error: "Subscription is not configured (missing RevenueCat API key)." };
  }

  try {
    await ensurePurchasesReady(appUserId);

    const { result } = await RevenueCatUI.presentPaywall();

    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED: {
        const { customerInfo } = await Purchases.getCustomerInfo();
        applyProFromCustomerInfo(customerInfo);
        if (!entitlementActive(customerInfo)) {
          return {
            ok: false,
            error: `Purchase recorded but entitlement "${ENTITLEMENT_ID}" is not active yet.`,
          };
        }
        return { ok: true };
      }
      case PAYWALL_RESULT.CANCELLED:
        return { ok: false, error: "Purchase cancelled.", userCancelled: true };
      case PAYWALL_RESULT.NOT_PRESENTED:
      case PAYWALL_RESULT.ERROR:
      default:
        return {
          ok: false,
          error: "Paywall could not be completed. Configure a paywall in the RevenueCat dashboard.",
        };
    }
  } catch (e: unknown) {
    const err = e as { message?: string };
    return {
      ok: false,
      error: err.message || "Paywall failed. Please try again.",
    };
  }
}

