/**
 * In-App Purchase — ChefCoach Pro subscriptions.
 *
 * RevenueCat is configured lazily (paywall / Subscribe / Restore only).
 *
 * Product IDs (App Store Connect + RevenueCat dashboard):
 *   com.chefcoach.pro.monthly  — $7.99 / month
 *   com.chefcoach.pro.yearly   — $59.99 / year
 */

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import type { UserProfile } from "@/types";
import {
  patchLocalProfileSubscription,
  setProStatus,
} from "@/lib/profileSupabase";
import { isProBypassEmail, resolveAuthEmail } from "@/lib/trial";
import {
  ensurePurchasesReady,
  fetchOfferingsSafe,
  parsePurchaseError,
  PRODUCT_MONTHLY,
  PRODUCT_YEARLY,
} from "@/lib/revenueCat";

export { PRODUCT_MONTHLY, PRODUCT_YEARLY };

const ENTITLEMENT_ID = "pro";

function isNativePlatform(): boolean {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android";
}

function expiryForPlan(productId: string): Date {
  const d = new Date();
  if (productId === PRODUCT_YEARLY) d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function applyProToLocalProfile(
  isPro: boolean,
  expiresAt: Date | null,
  setProfile: ((p: UserProfile) => void) | null,
  currentProfile: UserProfile | null
): void {
  patchLocalProfileSubscription(isPro, expiresAt);
  if (setProfile && currentProfile) {
    setProfile({
      ...currentProfile,
      isPro,
      subscriptionExpiresAt: expiresAt?.toISOString() ?? null,
    });
  }
}

export type IAPResult =
  | { ok: true; productId: string }
  | { ok: false; error: string; userCancelled?: boolean };

/**
 * Purchase a RevenueCat package — preferred path when offerings are already loaded.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
  appUserId: string | null,
  currentProfile: UserProfile | null = null,
  setProfile: ((p: UserProfile) => void) | null = null
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
    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];

    if (!entitlement?.isActive) {
      return {
        ok: false,
        error: `Purchase completed but Pro access is not active yet. Try Restore Purchases or contact support.`,
      };
    }

    const productId = pkg.product.identifier;
    const expiresAt = entitlement.expirationDate
      ? new Date(entitlement.expirationDate)
      : expiryForPlan(productId);

    if (appUserId) {
      await setProStatus(appUserId, true, expiresAt);
    }
    applyProToLocalProfile(true, expiresAt, setProfile, currentProfile);

    return { ok: true, productId };
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
  appUserId: string | null,
  currentProfile: UserProfile | null = null,
  setProfile: ((p: UserProfile) => void) | null = null
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

    return purchasePackage(pkg, appUserId, currentProfile, setProfile);
  } catch (e: unknown) {
    const parsed = parsePurchaseError(e);
    return { ok: false, error: parsed.message, userCancelled: parsed.userCancelled };
  }
}

export async function restoreIAPPurchases(
  appUserId: string | null,
  currentProfile: UserProfile | null = null,
  setProfile: ((p: UserProfile) => void) | null = null
): Promise<IAPResult> {
  if (!isNativePlatform()) {
    return { ok: false, error: "Restore is only available in the ChefCoach iOS app." };
  }

  try {
    const ready = await ensurePurchasesReady(appUserId);
    if (!ready) return { ok: false, error: "Subscription service unavailable." };

    const mod = await import("@revenuecat/purchases-capacitor");
    const { Purchases } = mod;
    const { customerInfo } = await Purchases.restorePurchases();
    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];

    if (!entitlement?.isActive) {
      if (appUserId) await setProStatus(appUserId, false, null);
      applyProToLocalProfile(false, null, setProfile, currentProfile);
      return {
        ok: false,
        error:
          "No active subscription found. If you subscribed, make sure you're signed in with the same Apple ID.",
      };
    }

    const expiresAt = entitlement.expirationDate
      ? new Date(entitlement.expirationDate)
      : expiryForPlan(PRODUCT_MONTHLY);

    if (appUserId) await setProStatus(appUserId, true, expiresAt);
    applyProToLocalProfile(true, expiresAt, setProfile, currentProfile);

    return { ok: true, productId: entitlement.productIdentifier };
  } catch (e: unknown) {
    const parsed = parsePurchaseError(e);
    return { ok: false, error: parsed.message, userCancelled: parsed.userCancelled };
  }
}

export async function verifySubscriptionOnLaunch(
  appUserId: string | null,
  currentProfile: UserProfile | null,
  setProfile: (p: UserProfile) => void,
  userEmail?: string | null
): Promise<void> {
  const authEmail = userEmail ?? resolveAuthEmail(null);
  if (isProBypassEmail(authEmail)) {
    if (appUserId) await setProStatus(appUserId, true, null);
    if (currentProfile) applyProToLocalProfile(true, null, setProfile, currentProfile);
    return;
  }

  if (!currentProfile?.isPro) return;

  const localExpiry = currentProfile.subscriptionExpiresAt
    ? new Date(currentProfile.subscriptionExpiresAt)
    : null;

  if (localExpiry && localExpiry <= new Date()) {
    if (appUserId) await setProStatus(appUserId, false, null);
    applyProToLocalProfile(false, null, setProfile, currentProfile);
  }
}

export { fetchOfferingsSafe, EMPTY_OFFERINGS, type OfferingsState } from "@/lib/revenueCat";
