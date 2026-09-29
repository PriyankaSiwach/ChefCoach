import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProStatus,
  isProActive,
  readServerProStatus,
  saveServerProStatus,
  setRevenueCatEntitlement,
  SUBSCRIPTION_CHANGED_EVENT,
} from "./proStatus";
import { RECIPIFY_PROFILE_STORAGE_KEY } from "./profileStorage";

const USER = "user-1";
const NOW = Date.parse("2026-09-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

function serverSays(isPro: boolean, expiresAt: string | null, userId = USER) {
  saveServerProStatus({ userId, isPro, expiresAt, source: "revenuecat", checkedAt: iso(NOW) });
}

afterEach(() => {
  clearProStatus();
  window.localStorage.clear();
});

describe("isProActive — only the server answer or the RevenueCat SDK count", () => {
  it("is false with nothing known", () => {
    expect(isProActive(USER, NOW)).toBe(false);
    expect(isProActive(null, NOW)).toBe(false);
  });

  it("server says Pro until a future expiry", () => {
    serverSays(true, iso(NOW + DAY));
    expect(isProActive(USER, NOW)).toBe(true);
  });

  it("server Pro with no expiry (comp) stays Pro", () => {
    serverSays(true, null);
    expect(isProActive(USER, NOW)).toBe(true);
  });

  it("an expired server answer is not Pro", () => {
    serverSays(true, iso(NOW - 1));
    expect(isProActive(USER, NOW)).toBe(false);
  });

  it("server says not Pro", () => {
    serverSays(false, null);
    expect(isProActive(USER, NOW)).toBe(false);
  });

  it("another user's cached answer is ignored", () => {
    serverSays(true, null, "someone-else");
    expect(isProActive(USER, NOW)).toBe(false);
  });

  it("RevenueCat SDK active entitlement for this user counts, even if the server says no", () => {
    serverSays(false, null);
    setRevenueCatEntitlement({ userId: USER, active: true, expiresAt: iso(NOW + DAY) });
    expect(isProActive(USER, NOW)).toBe(true);
  });

  it("RevenueCat SDK answer for a different appUserID, inactive, or expired does not count", () => {
    setRevenueCatEntitlement({ userId: "other", active: true, expiresAt: null });
    expect(isProActive(USER, NOW)).toBe(false);
    setRevenueCatEntitlement({ userId: USER, active: false, expiresAt: null });
    expect(isProActive(USER, NOW)).toBe(false);
    setRevenueCatEntitlement({ userId: USER, active: true, expiresAt: iso(NOW - 1) });
    expect(isProActive(USER, NOW)).toBe(false);
  });

  it("the RevenueCat SDK answer is never written to storage", () => {
    setRevenueCatEntitlement({ userId: USER, active: true, expiresAt: null });
    expect(window.localStorage.length).toBe(0);
  });

  it("ignores the old recipify_is_pro flag, the profile's isPro, and email addresses", () => {
    window.localStorage.setItem("recipify_is_pro", "true");
    window.localStorage.setItem(
      RECIPIFY_PROFILE_STORAGE_KEY,
      JSON.stringify({ isPro: true, subscriptionExpiresAt: null })
    );
    window.localStorage.setItem("recipify_email", "support@pstechnologiesinc.com");
    expect(isProActive(USER, NOW)).toBe(false);
  });

  it("saving a server answer removes the old recipify_is_pro flag", () => {
    window.localStorage.setItem("recipify_is_pro", "true");
    serverSays(false, null);
    expect(window.localStorage.getItem("recipify_is_pro")).toBeNull();
  });

  it("clearProStatus forgets both sources", () => {
    serverSays(true, null);
    setRevenueCatEntitlement({ userId: USER, active: true, expiresAt: null });
    clearProStatus();
    expect(readServerProStatus()).toBeNull();
    expect(isProActive(USER, NOW)).toBe(false);
  });

  it("announces changes so the UI re-renders", () => {
    const listener = vi.fn();
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, listener);
    serverSays(true, null);
    setRevenueCatEntitlement(null);
    window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
