/**
 * In-App Purchase — ChefCoach Pro subscriptions.
 *
 * RevenueCat is configured lazily (paywall / Subscribe / Restore only).
 * Never initialized on app launch or unrelated flows (e.g. photo picker).
 *
 * Product IDs (App Store Connect + RevenueCat dashboard):
 *   com.chefcoach.pro.monthly  — $7.99 / month
 *   com.chefcoach.pro.yearly   — $59.99 / year
 */

import { Capacitor } from "@capacitor/core";
import type { UserProfile } from "@/types";
import {
  patchLocalProfileSubscription,
  setProStatus,
} from "@/lib/profileSupabase";
import { isProBypassEmail, resolveAuthEmail } from "@/lib/trial";
import {
  ensurePurchasesReady,
  fetchOfferingsSafe,
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
 * Purchase a subscription — only called from paywall Subscribe button.
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
      productId === PRODUCT_YEARLY
        ? offerings.yearlyPackage
        : offerings.monthlyPackage;

    if (!pkg) {
      return {
        ok: false,
        error: `Product "${productId}" not found. Verify App Store Connect + RevenueCat setup.`,
      };
    }

    const ready = await ensurePurchasesReady(appUserId);
    if (!ready) {
      return { ok: false, error: "Subscription SDK not available on this device." };
    }

    const mod = await import("@revenuecat/purchases-capacitor");
    const { Purchases } = mod;
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];

    if (!entitlement?.isActive) {
      return {
        ok: false,
        error: `Purchase recorded but entitlement "${ENTITLEMENT_ID}" is not yet active. Contact support if this persists.`,
      };
    }

    const expiresAt = entitlement.expirationDate
      ? new Date(entitlement.expirationDate)
      : expiryForPlan(productId);

    if (appUserId) {
      await setProStatus(appUserId, true, expiresAt);
    }
    applyProToLocalProfile(true, expiresAt, setProfile, currentProfile);

    return { ok: true, productId };
  } catch (e: unknown) {
    const err = e as { message?: string; userCancelled?: boolean };
    if (err.userCancelled) return { ok: false, error: "Purchase cancelled.", userCancelled: true };
    return { ok: false, error: err.message || "Purchase failed. Please try again." };
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
    if (!ready) return { ok: false, error: "Purchase SDK unavailable." };

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
    const err = e as { message?: string };
    return { ok: false, error: err.message || "Restore failed. Please try again." };
  }
}

/**
 * Local profile expiry check on login — does NOT call RevenueCat (no offerings fetch).
 * Pro status is refreshed when user purchases or restores via the paywall.
 */
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

/** Re-export for PaywallScreen to prefetch offerings when opened. */
export { fetchOfferingsSafe, type OfferingsState } from "@/lib/revenueCat";
