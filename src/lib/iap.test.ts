import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { platform, Purchases, refreshSubscriptionStatus } = vi.hoisted(() => ({
  platform: { current: "ios" },
  Purchases: {
    setLogLevel: vi.fn(async () => {}),
    configure: vi.fn(async () => {}),
    logIn: vi.fn(),
    logOut: vi.fn(async () => ({})),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    getCustomerInfo: vi.fn(),
  },
  refreshSubscriptionStatus: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => platform.current,
    isNativePlatform: () => platform.current !== "web",
  },
}));
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases,
  LOG_LEVEL: { DEBUG: "DEBUG" },
  PACKAGE_TYPE: { MONTHLY: "MONTHLY", ANNUAL: "ANNUAL" },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: "1" },
}));
vi.mock("@/lib/subscription-api", () => ({ refreshSubscriptionStatus }));

import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { purchasePackage, restoreIAPPurchases, syncProOnLaunch } from "./iap";
import { clearProStatus, isProActive, saveServerProStatus } from "./proStatus";
import { RECIPIFY_PROFILE_STORAGE_KEY } from "./profileStorage";

const USER = "11111111-2222-4333-8444-555555555555";
const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const customerInfo = (active: boolean) => ({
  customerInfo: {
    entitlements: {
      active: active
        ? { pro: { isActive: true, expirationDate: future(), productIdentifier: "com.chefcoach.pro.yearly" } }
        : {},
    },
  },
});

const pkg = { product: { identifier: "com.chefcoach.pro.yearly" } } as unknown as PurchasesPackage;

function serverAnswers(isPro: boolean, source = "revenuecat") {
  refreshSubscriptionStatus.mockImplementation(async () => {
    const status = { userId: USER, isPro, expiresAt: isPro ? future() : null, source, checkedAt: "" };
    saveServerProStatus(status);
    return { ok: true, status };
  });
}

function serverFails() {
  refreshSubscriptionStatus.mockResolvedValue({ ok: false, reason: "unreachable" });
}

beforeEach(() => {
  platform.current = "ios";
  Purchases.logIn.mockResolvedValue(customerInfo(false));
  Purchases.getCustomerInfo.mockResolvedValue(customerInfo(false));
  serverFails();
});

afterEach(() => {
  vi.clearAllMocks();
  clearProStatus();
  window.localStorage.clear();
});

describe("purchase", () => {
  it("shows Pro from the RevenueCat SDK right away and asks the server to re-check", async () => {
    Purchases.purchasePackage.mockResolvedValue(customerInfo(true));

    const result = await purchasePackage(pkg, USER);

    expect(result).toEqual({ ok: true, productId: "com.chefcoach.pro.yearly" });
    expect(isProActive(USER)).toBe(true);
    expect(refreshSubscriptionStatus).toHaveBeenCalledTimes(1);
  });

  it("never writes Pro into local storage or the profile", async () => {
    window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify({ name: "Priya" }));
    Purchases.purchasePackage.mockResolvedValue(customerInfo(true));

    await purchasePackage(pkg, USER);

    expect(window.localStorage.getItem("recipify_is_pro")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY) ?? "{}")).toEqual({ name: "Priya" });
  });

  it("a purchase that doesn't activate the entitlement is not Pro", async () => {
    Purchases.purchasePackage.mockResolvedValue(customerInfo(false));
    const result = await purchasePackage(pkg, USER);
    expect(result.ok).toBe(false);
    expect(isProActive(USER)).toBe(false);
  });

  it("Pro stays on even when the server check fails (offline / 502)", async () => {
    serverFails();
    Purchases.purchasePackage.mockResolvedValue(customerInfo(true));
    await purchasePackage(pkg, USER);
    expect(isProActive(USER)).toBe(true);
  });
});

describe("Restore Purchases", () => {
  it("active entitlement → Pro, and the server re-checks", async () => {
    Purchases.restorePurchases.mockResolvedValue(customerInfo(true));
    const result = await restoreIAPPurchases(USER);
    expect(result.ok).toBe(true);
    expect(isProActive(USER)).toBe(true);
    expect(refreshSubscriptionStatus).toHaveBeenCalled();
  });

  it("no App Store purchase but the server says Pro (comp or legacy) → Pro", async () => {
    Purchases.restorePurchases.mockResolvedValue(customerInfo(false));
    serverAnswers(true, "comp");
    const result = await restoreIAPPurchases(USER);
    expect(result).toEqual({ ok: true, productId: "comp" });
    expect(isProActive(USER)).toBe(true);
  });

  it("nothing anywhere → the usual 'No active subscription found' message", async () => {
    Purchases.restorePurchases.mockResolvedValue(customerInfo(false));
    serverAnswers(false);
    const result = await restoreIAPPurchases(USER);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/no active subscription/i);
    expect(isProActive(USER)).toBe(false);
  });
});

describe("app launch", () => {
  it("server says Pro → RevenueCat SDK is not needed", async () => {
    serverAnswers(true);
    await syncProOnLaunch(USER);
    expect(isProActive(USER)).toBe(true);
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("server unreachable → the RevenueCat SDK can still confirm Pro on the phone", async () => {
    serverFails();
    Purchases.getCustomerInfo.mockResolvedValue(customerInfo(true));
    await syncProOnLaunch(USER);
    expect(isProActive(USER)).toBe(true);
  });

  it("server unreachable → the last known server answer is kept", async () => {
    saveServerProStatus({ userId: USER, isPro: true, expiresAt: future(), source: "revenuecat", checkedAt: "" });
    serverFails();
    await syncProOnLaunch(USER);
    expect(isProActive(USER)).toBe(true);
  });

  it("server says not Pro and the SDK agrees → free", async () => {
    serverAnswers(false);
    await syncProOnLaunch(USER);
    expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    expect(isProActive(USER)).toBe(false);
  });

  it("on the web only the server is asked", async () => {
    platform.current = "web";
    serverFails();
    await syncProOnLaunch(USER);
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
    expect(isProActive(USER)).toBe(false);
  });
});
