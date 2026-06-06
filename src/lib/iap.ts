/**
 * In-App Purchase — ChefCoach Pro subscriptions.
 *
 * Uses @revenuecat/purchases-capacitor (the only maintained Capacitor IAP SDK;
 * @capacitor-community/in-app-purchases does not exist on npm).
 * RevenueCat wraps Apple StoreKit and Google Play Billing identically.
 *
 * Product IDs (configure in App Store Connect + RevenueCat dashboard):
 *   com.chefcoach.pro.monthly  — $7.99 / month
 *   com.chefcoach.pro.yearly   — $59.99 / year
 *
 * ── Purchase flow ────────────────────────────────────────────────────────────
 *   purchaseProduct(productId, userId)
 *     → native Apple IAP sheet
 *     → on success: update_profile_subscription RPC → Supabase profile_data
 *     → isPro: true + subscriptionExpiresAt written
 *
 * ── Restore flow ─────────────────────────────────────────────────────────────
 *   restoreIAPPurchases(userId)
 *     → Purchases.restorePurchases()
 *     → if entitlement active: restore isPro: true in profile_data
 *     → if not active: clear isPro: false
 *
 * ── App launch check ─────────────────────────────────────────────────────────
 *   verifySubscriptionOnLaunch(userId, profile, setProfile)
 *     → called once on login; checks RevenueCat for live entitlement status
 *     → if expired: set isPro: false in profile_data + local profile
 *     → if active:  refresh subscriptionExpiresAt in profile_data
 *     → on web (no RevenueCat): date-comparison fallback against local profile
 */

import { Capacitor } from "@capacitor/core";
import type { UserProfile } from "@/types";
import {
  patchLocalProfileSubscription,
  setProStatus,
} from "@/lib/profileSupabase";

// ── Product IDs ───────────────────────────────────────────────────────────────
export const PRODUCT_MONTHLY = "com.chefcoach.pro.monthly";
export const PRODUCT_YEARLY  = "com.chefcoach.pro.yearly";

// Entitlement key — must match the entitlement identifier in RevenueCat dashboard
const ENTITLEMENT_ID = "pro";

// Public iOS API key (safe to embed; RevenueCat is designed around this pattern)
const RC_IOS_API_KEY = "appl_zWISHeIgOcePXOIWgZObpgvCzdY";

// ── Lazy RevenueCat module refs ───────────────────────────────────────────────
type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
let _mod: PurchasesModule | null = null;
let _configured = false;

function isNativePlatform(): boolean {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android";
}

async function getPurchases(): Promise<PurchasesModule | null> {
  if (!isNativePlatform()) return null;
  if (!_mod) {
    try { _mod = await import("@revenuecat/purchases-capacitor"); }
    catch { return null; }
  }
  return _mod;
}

function apiKey(): string | null {
  const p = Capacitor.getPlatform();
  if (p === "ios")
    // Env var overrides the hardcoded default; fallback ensures the key always works
    return (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined)?.trim()
      || RC_IOS_API_KEY;
  if (p === "android")
    return (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string | undefined)?.trim() || null;
  return null;
}

async function ensureConfigured(appUserId: string | null): Promise<PurchasesModule | null> {
  const mod = await getPurchases();
  if (!mod) return null;
  const key = apiKey();
  if (!key) return null;

  const { Purchases } = mod;
  if (!_configured) {
    await Purchases.configure({ apiKey: key, appUserID: appUserId ?? undefined });
    _configured = true;
  } else if (appUserId) {
    try { await Purchases.logIn({ appUserID: appUserId }); }
    catch { /* already logged in — ignore */ }
  }
  return mod;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  // Reflect in React state so effectivePro recalculates without a page reload
  if (setProfile && currentProfile) {
    setProfile({
      ...currentProfile,
      isPro,
      subscriptionExpiresAt: expiresAt?.toISOString() ?? null,
    });
  }
}

// ── Public types ──────────────────────────────────────────────────────────────
export type IAPResult =
  | { ok: true; productId: string }
  | { ok: false; error: string; userCancelled?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// purchaseProduct
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Purchase a specific subscription product by its App Store product ID.
 * On success: writes isPro + subscriptionExpiresAt into profile_data in Supabase.
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
    const mod = await ensureConfigured(appUserId);
    if (!mod) return { ok: false, error: "Subscription SDK not available on this device." };

    const { Purchases } = mod;
    const { current } = await Purchases.getOfferings();

    if (!current) {
      return {
        ok: false,
        error: "No offerings found. Make sure products are configured in the RevenueCat dashboard.",
      };
    }

    const pkg = current.availablePackages.find(
      (p) => p.product.identifier === productId
    );
    if (!pkg) {
      return {
        ok: false,
        error: `Product "${productId}" not found in RevenueCat offerings. Verify App Store Connect + RevenueCat setup.`,
      };
    }

    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];

    if (!entitlement?.isActive) {
      return {
        ok: false,
        error: `Purchase recorded but entitlement "${ENTITLEMENT_ID}" is not yet active. Contact support if this persists.`,
      };
    }

    // Use RevenueCat's own expiry date when available; fall back to calculated
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

// ─────────────────────────────────────────────────────────────────────────────
// restoreIAPPurchases
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Restore previous purchases via Purchases.restorePurchases().
 * Verifies the "pro" entitlement and updates profile_data in Supabase.
 * If no active entitlement is found, explicitly clears isPro: false.
 */
export async function restoreIAPPurchases(
  appUserId: string | null,
  currentProfile: UserProfile | null = null,
  setProfile: ((p: UserProfile) => void) | null = null
): Promise<IAPResult> {
  if (!isNativePlatform()) {
    return { ok: false, error: "Restore is only available in the ChefCoach iOS app." };
  }

  try {
    const mod = await ensureConfigured(appUserId);
    if (!mod) return { ok: false, error: "Purchase SDK unavailable." };

    const { Purchases } = mod;
    const { customerInfo } = await Purchases.restorePurchases();
    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];

    if (!entitlement?.isActive) {
      // No active sub found — clear pro status to keep Supabase in sync
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

// ─────────────────────────────────────────────────────────────────────────────
// verifySubscriptionOnLaunch
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Called once per session (on user login) to verify the subscription is still
 * active and keep profile_data in Supabase consistent.
 *
 * Native path  → asks RevenueCat for fresh CustomerInfo (one network call).
 * Web fallback → date-compares profile.subscriptionExpiresAt against Date.now().
 *
 * Results:
 *   • Active   → refreshes subscriptionExpiresAt from RevenueCat in Supabase
 *   • Expired  → sets isPro: false in Supabase profile_data + local profile
 *   • No sub   → no-op (user was never Pro)
 */
export async function verifySubscriptionOnLaunch(
  appUserId: string | null,
  currentProfile: UserProfile | null,
  setProfile: (p: UserProfile) => void
): Promise<void> {
  // Nothing to verify if user was never pro
  if (!currentProfile?.isPro) return;

  const localExpiry = currentProfile.subscriptionExpiresAt
    ? new Date(currentProfile.subscriptionExpiresAt)
    : null;

  // ── Web fallback: date comparison only ───────────────────────────────────
  if (!isNativePlatform()) {
    if (localExpiry && localExpiry <= new Date()) {
      // Subscription expired — clear pro
      if (appUserId) await setProStatus(appUserId, false, null);
      applyProToLocalProfile(false, null, setProfile, currentProfile);
    }
    // If no expiry (lifetime/dev grant) or still in future — leave alone
    return;
  }

  // ── Native path: ask RevenueCat ──────────────────────────────────────────
  try {
    const mod = await ensureConfigured(appUserId);
    if (!mod) return; // SDK unavailable — don't change anything

    const { Purchases } = mod;
    // fetchCustomerInfo is cached by RevenueCat SDK; only hits network when stale
    const { customerInfo } = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];

    if (!entitlement?.isActive) {
      // Subscription genuinely expired or was refunded
      if (appUserId) await setProStatus(appUserId, false, null);
      applyProToLocalProfile(false, null, setProfile, currentProfile);
      return;
    }

    // Still active — refresh expiry from RevenueCat's authoritative value
    const freshExpiry = entitlement.expirationDate
      ? new Date(entitlement.expirationDate)
      : null;

    // Only write back if the date actually changed (avoids unnecessary writes)
    const localExpiryStr = localExpiry?.toISOString() ?? null;
    const freshExpiryStr = freshExpiry?.toISOString() ?? null;
    if (localExpiryStr !== freshExpiryStr) {
      if (appUserId) await setProStatus(appUserId, true, freshExpiry);
      applyProToLocalProfile(true, freshExpiry, setProfile, currentProfile);
    }
  } catch {
    // Network failure — leave local state as-is; we'll retry next launch
  }
}
