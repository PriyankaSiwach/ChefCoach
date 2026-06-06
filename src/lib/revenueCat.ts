import { Capacitor } from "@capacitor/core";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";

// Public iOS API key — safe to embed in the client bundle (RevenueCat design).
const RC_IOS_API_KEY = "appl_zWISHeIgOcePXOIWgZObpgvCzdY";
const ENTITLEMENT_ID = "pro";

type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
type RevenueCatUIModule = typeof import("@revenuecat/purchases-capacitor-ui");

let purchasesMod: PurchasesModule | null = null;
let uiMod: RevenueCatUIModule | null = null;
let configured = false;

/** RevenueCat entitlement id (e.g. `pro`) — matches dashboard & `customerInfo.entitlements.active[id]`. */
export function getRevenueCatEntitlementId(): string {
  return ENTITLEMENT_ID;
}

export function isRevenueCatPurchasePlatform(): boolean {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android";
}

/** Lazy-load native SDK — never imported on web so localhost dev stays stable. */
async function getPurchases(): Promise<PurchasesModule | null> {
  if (!isRevenueCatPurchasePlatform()) return null;
  if (!purchasesMod) {
    try {
      purchasesMod = await import("@revenuecat/purchases-capacitor");
    } catch (e) {
      console.warn("[RevenueCat] Purchases SDK unavailable:", e);
      return null;
    }
  }
  return purchasesMod;
}

async function getRevenueCatUI(): Promise<RevenueCatUIModule | null> {
  if (!isRevenueCatPurchasePlatform()) return null;
  if (!uiMod) {
    try {
      uiMod = await import("@revenuecat/purchases-capacitor-ui");
    } catch (e) {
      console.warn("[RevenueCat] Paywall UI unavailable:", e);
      return null;
    }
  }
  return uiMod;
}

function apiKeyForPlatform(): string | null {
  const p = Capacitor.getPlatform();
  if (p === "ios") {
    // Env var overrides the hardcoded key (useful for switching environments)
    return (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined)?.trim()
      || RC_IOS_API_KEY;
  }
  if (p === "android") {
    return (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string | undefined)?.trim() || null;
  }
  return null;
}

export async function initializeRevenueCatSdkOnLaunch(): Promise<void> {
  if (!isRevenueCatPurchasePlatform()) return;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return;
  try {
    const mod = await getPurchases();
    if (!mod) return;
    const { Purchases, LOG_LEVEL } = mod;
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

/** True if the configured entitlement is in `entitlements.active`. */
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

  const mod = await getPurchases();
  if (!mod) return false;
  const { Purchases } = mod;

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

export async function syncRevenueCatUser(appUserId: string | null): Promise<void> {
  const ok = await ensurePurchasesReady(appUserId);
  if (!ok) return;
  try {
    const mod = await getPurchases();
    if (!mod) return;
    const { customerInfo } = await mod.Purchases.getCustomerInfo();
    applyProFromCustomerInfo(customerInfo);
  } catch {
    /* ignore */
  }
}

export async function refreshProFromRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    const mod = await getPurchases();
    if (!mod) return;
    const { customerInfo } = await mod.Purchases.getCustomerInfo();
    applyProFromCustomerInfo(customerInfo);
  } catch {
    /* ignore */
  }
}

export async function revenueCatLogOut(): Promise<void> {
  if (!configured) return;
  try {
    const mod = await getPurchases();
    if (!mod) return;
    const { customerInfo } = await mod.Purchases.logOut();
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

/** Restore previous purchases (required by App Store guidelines). */
export async function restorePurchases(appUserId: string | null): Promise<PurchaseProResult> {
  if (!isRevenueCatPurchasePlatform()) {
    return { ok: false, error: "Restore is only available in the iOS app." };
  }
  try {
    await ensurePurchasesReady(appUserId);
    const mod = await getPurchases();
    if (!mod) return { ok: false, error: "Purchase SDK unavailable." };
    const { customerInfo } = await mod.Purchases.restorePurchases();
    applyProFromCustomerInfo(customerInfo);
    if (entitlementActive(customerInfo)) {
      return { ok: true };
    }
    return {
      ok: false,
      error: "No active subscription found to restore. If you subscribed, make sure you're signed in with the same Apple ID.",
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { ok: false, error: err.message || "Restore failed. Please try again." };
  }
}

export async function presentRevenueCatPaywall(appUserId: string | null): Promise<PurchaseProResult> {
  if (!isRevenueCatPurchasePlatform()) {
    return {
      ok: false,
      error: "Subscribe in the ChefCoach iOS app with your Apple ID to unlock Pro.",
    };
  }
  const apiKey = apiKeyForPlatform();
  if (!apiKey) {
    return { ok: false, error: "Subscription is not configured (missing RevenueCat API key)." };
  }

  try {
    await ensurePurchasesReady(appUserId);

    const ui = await getRevenueCatUI();
    const purchases = await getPurchases();
    if (!ui || !purchases) {
      return { ok: false, error: "Subscription SDK is not available on this device." };
    }

    const { RevenueCatUI, PAYWALL_RESULT } = ui;
    const { Purchases } = purchases;
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
