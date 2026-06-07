import { Capacitor } from "@capacitor/core";
import type { CustomerInfo, PurchasesPackage } from "@revenuecat/purchases-capacitor";

// Public iOS API key — safe to embed in the client bundle (RevenueCat design).
const RC_IOS_API_KEY = "appl_zWISHeIgOcePXOIWgZObpgvCzdY";
const ENTITLEMENT_ID = "pro";

/** Must match App Store Connect + RevenueCat dashboard exactly. */
export const PRODUCT_MONTHLY = "com.chefcoach.pro.monthly";
export const PRODUCT_YEARLY = "com.chefcoach.pro.yearly";

type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
type RevenueCatUIModule = typeof import("@revenuecat/purchases-capacitor-ui");

let purchasesMod: PurchasesModule | null = null;
let uiMod: RevenueCatUIModule | null = null;
let configured = false;

export type OfferingsState = {
  available: boolean;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  warning: string | null;
};

const EMPTY_OFFERINGS: OfferingsState = {
  available: false,
  monthlyPackage: null,
  yearlyPackage: null,
  warning: null,
};

/** RevenueCat entitlement id (e.g. `pro`) — matches dashboard & `customerInfo.entitlements.active[id]`. */
export function getRevenueCatEntitlementId(): string {
  return ENTITLEMENT_ID;
}

export function isRevenueCatPurchasePlatform(): boolean {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android";
}

function logRevenueCatWarning(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.warn(`[RevenueCat] ${message}`, detail);
  } else {
    console.warn(`[RevenueCat] ${message}`);
  }
}

/** Lazy-load native SDK — never imported on web so localhost dev stays stable. */
async function getPurchases(): Promise<PurchasesModule | null> {
  if (!isRevenueCatPurchasePlatform()) return null;
  if (!purchasesMod) {
    try {
      purchasesMod = await import("@revenuecat/purchases-capacitor");
    } catch (e) {
      logRevenueCatWarning("Purchases SDK unavailable", e);
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
      logRevenueCatWarning("Paywall UI unavailable", e);
      return null;
    }
  }
  return uiMod;
}

function apiKeyForPlatform(): string | null {
  const p = Capacitor.getPlatform();
  if (p === "ios") {
    return (
      (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined)?.trim() ||
      RC_IOS_API_KEY
    );
  }
  if (p === "android") {
    return (
      (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string | undefined)?.trim() || null
    );
  }
  return null;
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

/**
 * Configure RevenueCat lazily — only when user opens paywall / taps Subscribe / Restore.
 * Never call on app launch or photo picker flows.
 */
export async function ensurePurchasesReady(appUserId: string | null): Promise<boolean> {
  if (!isRevenueCatPurchasePlatform()) return false;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return false;

  const mod = await getPurchases();
  if (!mod) return false;
  const { Purchases } = mod;

  try {
    if (!configured) {
      if (import.meta.env.DEV) {
        const { LOG_LEVEL } = mod;
        await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      }
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
  } catch (e) {
    logRevenueCatWarning("SDK configure failed (non-fatal)", e);
    return false;
  }
}

function offeringsWarningMessage(reason: string): string {
  if (import.meta.env.DEV) {
    return `${reason} Simulator/dev builds cannot load real App Store products — use a physical device with ${PRODUCT_MONTHLY} and ${PRODUCT_YEARLY} configured in App Store Connect and RevenueCat.`;
  }
  return `${reason} Please try again in a moment.`;
}

/**
 * Fetch RevenueCat offerings when user opens paywall. Never throws — logs warning only.
 */
export async function fetchOfferingsSafe(appUserId: string | null): Promise<OfferingsState> {
  if (!isRevenueCatPurchasePlatform()) {
    return {
      ...EMPTY_OFFERINGS,
      warning: "Subscribe in the ChefCoach iOS app with your Apple ID to unlock Pro.",
    };
  }

  const ready = await ensurePurchasesReady(appUserId);
  if (!ready) {
    return {
      ...EMPTY_OFFERINGS,
      warning: offeringsWarningMessage("Subscription SDK is not available."),
    };
  }

  try {
    const mod = await getPurchases();
    if (!mod) {
      return {
        ...EMPTY_OFFERINGS,
        warning: offeringsWarningMessage("Subscription SDK is not available."),
      };
    }

    const { Purchases } = mod;
    const { current } = await Purchases.getOfferings();

    if (!current?.availablePackages?.length) {
      logRevenueCatWarning(
        "No offerings available. Verify products in App Store Connect + RevenueCat:",
        { monthly: PRODUCT_MONTHLY, yearly: PRODUCT_YEARLY }
      );
      return {
        ...EMPTY_OFFERINGS,
        warning: offeringsWarningMessage(
          "Subscription plans are not available yet."
        ),
      };
    }

    const monthlyPackage =
      current.availablePackages.find((p) => p.product.identifier === PRODUCT_MONTHLY) ??
      null;
    const yearlyPackage =
      current.availablePackages.find((p) => p.product.identifier === PRODUCT_YEARLY) ??
      null;

    if (!monthlyPackage && !yearlyPackage) {
      logRevenueCatWarning(
        "Products missing from current offering. Expected IDs:",
        { monthly: PRODUCT_MONTHLY, yearly: PRODUCT_YEARLY, found: current.availablePackages.map((p) => p.product.identifier) }
      );
      return {
        ...EMPTY_OFFERINGS,
        warning: offeringsWarningMessage(
          `Products ${PRODUCT_MONTHLY} and ${PRODUCT_YEARLY} were not found in RevenueCat offerings.`
        ),
      };
    }

    return {
      available: true,
      monthlyPackage,
      yearlyPackage,
      warning: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logRevenueCatWarning("Error fetching offerings (non-fatal)", msg);
    return {
      ...EMPTY_OFFERINGS,
      warning: offeringsWarningMessage(
        msg.includes("App Store Connect")
          ? "App Store products could not be loaded."
          : "Could not load subscription plans."
      ),
    };
  }
}

export async function refreshProFromRevenueCat(_appUserId?: string | null): Promise<void> {
  if (!configured) return;
  try {
    const mod = await getPurchases();
    if (!mod) return;
    const { customerInfo } = await mod.Purchases.getCustomerInfo();
    applyProFromCustomerInfo(customerInfo);
  } catch (e) {
    logRevenueCatWarning("refreshProFromRevenueCat failed (non-fatal)", e);
  }
}

export async function revenueCatLogOut(): Promise<void> {
  if (!configured) return;
  try {
    const mod = await getPurchases();
    if (!mod) return;
    const { customerInfo } = await mod.Purchases.logOut();
    applyProFromCustomerInfo(customerInfo);
  } catch (e) {
    logRevenueCatWarning("logOut failed (non-fatal)", e);
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
      error:
        "No active subscription found to restore. If you subscribed, make sure you're signed in with the same Apple ID.",
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
    const offerings = await fetchOfferingsSafe(appUserId);
    if (!offerings.available) {
      return {
        ok: false,
        error: offerings.warning ?? "Subscription plans are not available right now.",
      };
    }

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
