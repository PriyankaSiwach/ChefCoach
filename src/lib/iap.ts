/**
 * In-App Purchase — ChefCoach Pro subscriptions.
 *
 * RevenueCat is configured lazily (paywall / Subscribe / Restore, or on launch when
 * the server can't confirm Pro).
 *
 * The phone never grants itself Pro. After a purchase or restore it records what the
 * RevenueCat SDK reports (in memory) and asks the server to re-check; see proStatus.ts.
 *
 * Product IDs (App Store Connect + RevenueCat dashboard):
 *   com.chefcoach.pro.monthly  — $7.99 / month
 *   com.chefcoach.pro.yearly   — $59.99 / year
 */

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import {
  applyProFromCustomerInfo,
  checkRevenueCatEntitlement,
  ensurePurchasesReady,
  fetchOfferingsSafe,
  getRevenueCatEntitlementId,
  parsePurchaseError,
  PRODUCT_MONTHLY,
  PRODUCT_YEARLY,
} from "@/lib/revenueCat";
import { refreshSubscriptionStatus } from "@/lib/subscription-api";
import { isProActive } from "@/lib/proStatus";

export { PRODUCT_MONTHLY, PRODUCT_YEARLY };

function isNativePlatform(): boolean {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android";
}

export type IAPResult =
  | { ok: true; productId: string }
  | { ok: false; error: string; userCancelled?: boolean };

/**
 * Purchase a RevenueCat package — preferred path when offerings are already loaded.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
  appUserId: string | null
): Promise<IAPResult> {
  if (!isNativePlatform()) {
    return {
      ok: false,
      error: "Subscribe in the ChefCoach iOS app with your Apple ID to unlock Pro.",
    };
  }

  try {
    const ready = await ensurePurchasesReady(appUserId);
    if (!ready) {
      return { ok: false, error: "Subscription service is not available on this device." };
    }

    const mod = await import("@revenuecat/purchases-capacitor");
    const { Purchases } = mod;
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    applyProFromCustomerInfo(customerInfo);
    const entitlement = customerInfo.entitlements?.active?.[getRevenueCatEntitlementId()];

    if (!entitlement?.isActive) {
      return {
        ok: false,
        error: `Purchase completed but Pro access is not active yet. Try Restore Purchases or contact support.`,
      };
    }

    // Pro already shows from the SDK; the server check runs in the background.
    void refreshSubscriptionStatus();

    return { ok: true, productId: pkg.product.identifier };
  } catch (e: unknown) {
    const parsed = parsePurchaseError(e);
    return { ok: false, error: parsed.message, userCancelled: parsed.userCancelled };
  }
}

/**
 * Purchase by product ID — fetches offerings then purchases the matching package.
 */
export async function purchaseProduct(
  productId: typeof PRODUCT_MONTHLY | typeof PRODUCT_YEARLY,
  appUserId: string | null
): Promise<IAPResult> {
  if (!isNativePlatform()) {
    return {
      ok: false,
      error: "Subscribe in the ChefCoach iOS app with your Apple ID to unlock Pro.",
    };
  }

  try {
    const offerings = await fetchOfferingsSafe(appUserId);
    if (!offerings.available) {
      return {
        ok: false,
        error:
          offerings.warning ??
          "Subscription plans are not available. Try again on a physical device.",
      };
    }

    const pkg =
      productId === PRODUCT_YEARLY ? offerings.yearlyPackage : offerings.monthlyPackage;

    if (!pkg) {
      return {
        ok: false,
        error: `The ${productId === PRODUCT_YEARLY ? "yearly" : "monthly"} plan is unavailable right now.`,
      };
    }

    return purchasePackage(pkg, appUserId);
  } catch (e: unknown) {
    const parsed = parsePurchaseError(e);
    return { ok: false, error: parsed.message, userCancelled: parsed.userCancelled };
  }
}

export async function restoreIAPPurchases(appUserId: string | null): Promise<IAPResult> {
  if (!isNativePlatform()) {
    return { ok: false, error: "Restore is only available in the ChefCoach iOS app." };
  }

  try {
    const ready = await ensurePurchasesReady(appUserId);
    if (!ready) return { ok: false, error: "Subscription service unavailable." };

    const mod = await import("@revenuecat/purchases-capacitor");
    const { Purchases } = mod;
    const { customerInfo } = await Purchases.restorePurchases();
    applyProFromCustomerInfo(customerInfo);
    const entitlement = customerInfo.entitlements?.active?.[getRevenueCatEntitlementId()];

    if (!entitlement?.isActive) {
      // The server may still know about Pro (comp account or legacy grant).
      const server = await refreshSubscriptionStatus();
      if (server.ok && isProActive(appUserId)) {
        return { ok: true, productId: server.status.source };
      }
      return {
        ok: false,
        error:
          "No active subscription found. If you subscribed, make sure you're signed in with the same Apple ID.",
      };
    }

    void refreshSubscriptionStatus();

    return { ok: true, productId: entitlement.productIdentifier };
  } catch (e: unknown) {
    const parsed = parsePurchaseError(e);
    return { ok: false, error: parsed.message, userCancelled: parsed.userCancelled };
  }
}

/**
 * On launch: ask the server first. If it can't confirm Pro (not Pro, offline, or not
 * configured), ask the RevenueCat SDK on native so a subscriber it knows about keeps Pro.
 * Failures keep the last known server answer (until its expiry).
 */
export async function syncProOnLaunch(userId: string): Promise<void> {
  await refreshSubscriptionStatus();
  if (isNativePlatform() && !isProActive(userId)) {
    await checkRevenueCatEntitlement(userId);
  }
}

export { fetchOfferingsSafe, EMPTY_OFFERINGS, type OfferingsState } from "@/lib/revenueCat";
