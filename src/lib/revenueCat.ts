import { Capacitor } from "@capacitor/core";
import type { CustomerInfo, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { PACKAGE_TYPE, PURCHASES_ERROR_CODE } from "@revenuecat/purchases-capacitor";

// Public iOS API key — safe to embed in the client bundle (RevenueCat design).
const RC_IOS_API_KEY = "appl_zWISHeIgOcePXOIWgZObpgvCzdY";
const ENTITLEMENT_ID = "pro";

/** Must match App Store Connect + RevenueCat dashboard exactly. */
export const PRODUCT_MONTHLY = "com.chefcoach.pro.monthly";
export const PRODUCT_YEARLY = "com.chefcoach.pro.yearly";

type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");

let purchasesMod: PurchasesModule | null = null;
let configured = false;

export type OfferingsState = {
  available: boolean;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  monthlyPrice: string | null;
  yearlyPrice: string | null;
  yearlyPerMonthPrice: string | null;
  warning: string | null;
};

export const EMPTY_OFFERINGS: OfferingsState = {
  available: false,
  monthlyPackage: null,
  yearlyPackage: null,
  monthlyPrice: null,
  yearlyPrice: null,
  yearlyPerMonthPrice: null,
  warning: null,
};

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

/** Resolve monthly/yearly packages from a RevenueCat offering. */
function resolvePackages(offering: {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
  availablePackages: PurchasesPackage[];
}): { monthlyPackage: PurchasesPackage | null; yearlyPackage: PurchasesPackage | null } {
  const byProductId = (id: string) =>
    offering.availablePackages.find((p) => p.product.identifier === id) ?? null;

  const monthlyPackage =
    offering.monthly ??
    byProductId(PRODUCT_MONTHLY) ??
    offering.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ??
    null;

  const yearlyPackage =
    offering.annual ??
    byProductId(PRODUCT_YEARLY) ??
    offering.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ??
    null;

  return { monthlyPackage, yearlyPackage };
}

export function parsePurchaseError(e: unknown): { message: string; userCancelled: boolean } {
  const err = e as {
    code?: string | PURCHASES_ERROR_CODE;
    message?: string;
    userCancelled?: boolean;
    userInfo?: { readableErrorCode?: string };
  };

  const code = String(err?.code ?? "");
  const cancelled =
    err?.userCancelled === true ||
    code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    code === "1";

  if (cancelled) {
    return { message: "Purchase cancelled.", userCancelled: true };
  }

  const readable = err?.userInfo?.readableErrorCode;
  if (readable === "PRODUCT_NOT_AVAILABLE_FOR_PURCHASE") {
    return {
      message: "This subscription is not available right now. Please try again shortly.",
      userCancelled: false,
    };
  }
  if (readable === "STORE_PROBLEM" || readable === "NETWORK_ERROR") {
    return {
      message: "Could not connect to the App Store. Check your connection and try again.",
      userCancelled: false,
    };
  }
  if (readable === "PURCHASE_NOT_ALLOWED") {
    return {
      message: "Purchases are not allowed on this device. Check Screen Time or parental controls.",
      userCancelled: false,
    };
  }
  if (readable === "CONFIGURATION_ERROR") {
    return {
      message: "Subscription setup is incomplete. Please contact support.",
      userCancelled: false,
    };
  }

  return {
    message: err?.message?.trim() || "Purchase failed. Please try again.",
    userCancelled: false,
  };
}

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
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
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
    return `${reason} Use a physical device with ${PRODUCT_MONTHLY} and ${PRODUCT_YEARLY} configured in App Store Connect and RevenueCat.`;
  }
  return `${reason} Please try again in a moment.`;
}

/** Fetch RevenueCat offerings when user opens paywall. Never throws. */
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
      warning: offeringsWarningMessage("Subscription service is not available."),
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
      logRevenueCatWarning("No offerings available. Verify App Store Connect + RevenueCat:", {
        monthly: PRODUCT_MONTHLY,
        yearly: PRODUCT_YEARLY,
      });
      return {
        ...EMPTY_OFFERINGS,
        warning: offeringsWarningMessage("Subscription plans are not available yet."),
      };
    }

    const { monthlyPackage, yearlyPackage } = resolvePackages(current);

    if (!monthlyPackage && !yearlyPackage) {
      logRevenueCatWarning("Products missing from current offering. Expected IDs:", {
        monthly: PRODUCT_MONTHLY,
        yearly: PRODUCT_YEARLY,
        found: current.availablePackages.map((p) => p.product.identifier),
      });
      return {
        ...EMPTY_OFFERINGS,
        warning: offeringsWarningMessage(
          `Could not find ${PRODUCT_MONTHLY} or ${PRODUCT_YEARLY} in RevenueCat offerings.`
        ),
      };
    }

    return {
      available: Boolean(monthlyPackage || yearlyPackage),
      monthlyPackage,
      yearlyPackage,
      monthlyPrice: monthlyPackage?.product.priceString ?? null,
      yearlyPrice: yearlyPackage?.product.priceString ?? null,
      yearlyPerMonthPrice: yearlyPackage?.product.pricePerMonthString ?? null,
      warning: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logRevenueCatWarning("Error fetching offerings (non-fatal)", msg);
    return {
      ...EMPTY_OFFERINGS,
      warning: offeringsWarningMessage(
        msg.includes("App Store") || msg.includes("StoreKit")
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
