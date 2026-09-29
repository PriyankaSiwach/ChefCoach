import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, isNativePlatform } = vi.hoisted(() => ({
  getSession: vi.fn(),
  isNativePlatform: vi.fn(() => false),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));

import { refreshSubscriptionStatus } from "./subscription-api";
import { clearProStatus, isProActive, readServerProStatus, saveServerProStatus } from "./proStatus";

const USER = "user-1";
const fetchMock = vi.fn();
const future = () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: "user-token", user: { id: USER } } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  getSession.mockReset();
  isNativePlatform.mockReturnValue(false);
  clearProStatus();
  window.localStorage.clear();
});

describe("refreshSubscriptionStatus", () => {
  it("POSTs to /api/subscription/refresh with the Supabase token and saves the answer", async () => {
    const expiresAt = future();
    fetchMock.mockResolvedValue(jsonResponse(200, { isPro: true, expiresAt, source: "revenuecat" }));

    const result = await refreshSubscriptionStatus();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subscription/refresh");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-token");
    expect(result).toMatchObject({ ok: true, status: { userId: USER, isPro: true, expiresAt } });
    expect(isProActive(USER)).toBe(true);
  });

  it("uses VITE_API_BASE_URL on native", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
    fetchMock.mockResolvedValue(jsonResponse(200, { isPro: false, expiresAt: null, source: "revenuecat" }));
    await refreshSubscriptionStatus();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/subscription/refresh");
  });

  it("a server 'not Pro' answer replaces an earlier Pro answer", async () => {
    saveServerProStatus({ userId: USER, isPro: true, expiresAt: future(), source: "legacy", checkedAt: "" });
    fetchMock.mockResolvedValue(jsonResponse(200, { isPro: false, expiresAt: null, source: "revenuecat" }));
    await refreshSubscriptionStatus();
    expect(isProActive(USER)).toBe(false);
  });
});

describe("a failed refresh keeps the last known status", () => {
  const cases: Array<[string, () => void, string]> = [
    ["offline", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch")), "unreachable"],
    ["502 (RevenueCat down)", () => fetchMock.mockResolvedValue(jsonResponse(502, { error: "x" })), "server_error"],
    ["503 not configured", () => fetchMock.mockResolvedValue(jsonResponse(503, { error: "x" })), "server_error"],
    ["429 rate limited", () => fetchMock.mockResolvedValue(jsonResponse(429, { error: "x" })), "server_error"],
    ["401 expired session", () => fetchMock.mockResolvedValue(jsonResponse(401, { error: "x" })), "server_error"],
    ["garbage body", () => fetchMock.mockResolvedValue(new Response("<html>", { status: 200 })), "bad_response"],
    ["wrong shape", () => fetchMock.mockResolvedValue(jsonResponse(200, { ok: true })), "bad_response"],
    [
      "backend not configured (native, no VITE_API_BASE_URL)",
      () => {
        isNativePlatform.mockReturnValue(true);
        vi.stubEnv("VITE_API_BASE_URL", "");
      },
      "backend_not_configured",
    ],
    ["no session", () => getSession.mockResolvedValue({ data: { session: null } }), "no_session"],
  ];

  it.each(cases)("%s", async (_name, arrange, reason) => {
    const expiresAt = future();
    saveServerProStatus({ userId: USER, isPro: true, expiresAt, source: "revenuecat", checkedAt: "" });
    arrange();

    const result = await refreshSubscriptionStatus();

    expect(result).toMatchObject({ ok: false, reason });
    expect(readServerProStatus()).toMatchObject({ userId: USER, isPro: true, expiresAt });
    expect(isProActive(USER)).toBe(true);
  });

  it("the kept status still ends at its expiry", async () => {
    saveServerProStatus({
      userId: USER,
      isPro: true,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      source: "revenuecat",
      checkedAt: "",
    });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await refreshSubscriptionStatus();
    expect(isProActive(USER)).toBe(false);
  });
});
