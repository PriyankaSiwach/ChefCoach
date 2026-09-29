import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleSubscriptionRefreshRequest,
  parseCompUserIds,
} from "./subscription-refresh.mjs";
import { lookupRevenueCatPro } from "./revenuecat.mjs";
import { createTokenBucketLimiter } from "./rate-limit.mjs";
import { jsonResponse, mockFetch } from "./test-fetch";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const COMP_ID = "99999999-8888-4777-8666-555555555555";
const NOW = Date.parse("2026-09-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const SECRET = "sk_TEST-SECRET-MARKER-abc123";
const ENTITLEMENT = "entl_pro_123";
const config = { secretKey: SECRET, projectId: "proj_abc", entitlementId: ENTITLEMENT };

type Row = { is_pro: boolean; expires_at: string | null; source: "revenuecat" | "comp" | "legacy" };

function fakeStore(initial: Record<string, Row> = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    get: vi.fn(async (userId: string) => rows.get(userId) ?? null),
    save: vi.fn(async (userId: string, row: Row) => {
      rows.set(userId, row);
    }),
    mirrorToProfile: vi.fn(async () => {}),
  };
}

const customer = (items: unknown[], extra: Record<string, unknown> = {}) =>
  jsonResponse({ object: "customer", id: USER_ID, active_entitlements: { object: "list", items, ...extra } });

function setup(reply: () => Promise<Response>, overrides: Record<string, unknown> = {}) {
  const fetchImpl = mockFetch(reply);
  const store = fakeStore();
  const deps = {
    verifyUser: vi.fn(async (token: string) =>
      token === "good"
        ? { ok: true as const, userId: USER_ID }
        : { ok: false as const, status: 401, error: "Invalid or expired session." }
    ),
    userLimiter: createTokenBucketLimiter({ capacity: 5, refillIntervalMs: 60_000 }),
    ipLimiter: createTokenBucketLimiter({ capacity: 10, refillIntervalMs: 60_000 }),
    lookupPro: (userId: string) => lookupRevenueCatPro(userId, { config, fetchImpl, now: NOW }),
    store,
    compUserIds: new Set<string>(),
    now: () => NOW,
    ...overrides,
  };
  return { fetchImpl, store: (deps.store as ReturnType<typeof fakeStore>), deps };
}

const req = (overrides = {}) => ({ authorization: "Bearer good", ip: "203.0.113.7", ...overrides });

describe("POST /api/subscription/refresh — RevenueCat answers", () => {
  it("real Pro: saves Pro with the RevenueCat expiry and mirrors it to the profile", async () => {
    const expiresMs = NOW + 20 * DAY;
    const { deps, store, fetchImpl } = setup(async () =>
      customer([{ object: "customer.active_entitlement", entitlement_id: ENTITLEMENT, expires_at: expiresMs }])
    );

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    const expiresAt = new Date(expiresMs).toISOString();
    expect(res).toEqual({ status: 200, json: { isPro: true, expiresAt, source: "revenuecat" } });
    expect(store.save).toHaveBeenCalledWith(USER_ID, { is_pro: true, expires_at: expiresAt, source: "revenuecat" });
    expect(store.mirrorToProfile).toHaveBeenCalledWith(USER_ID, { isPro: true, expiresAt });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.revenuecat.com/v2/projects/proj_abc/customers/${USER_ID}`);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${SECRET}`);
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("expired: an entitlement whose expiry has passed is not Pro, and overwrites an old Pro row", async () => {
    const { deps, store } = setup(async () =>
      customer([{ entitlement_id: ENTITLEMENT, expires_at: NOW - DAY }])
    );
    store.rows.set(USER_ID, { is_pro: true, expires_at: new Date(NOW - DAY).toISOString(), source: "revenuecat" });

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    expect(res.json).toEqual({ isPro: false, expiresAt: null, source: "revenuecat" });
    expect(store.rows.get(USER_ID)).toEqual({ is_pro: false, expires_at: null, source: "revenuecat" });
    expect(store.mirrorToProfile).toHaveBeenCalledWith(USER_ID, { isPro: false, expiresAt: null });
  });

  it("expired: an empty active-entitlements list is not Pro", async () => {
    const { deps } = setup(async () => customer([]));
    expect((await handleSubscriptionRefreshRequest(req(), deps)).json.isPro).toBe(false);
  });

  it("a different entitlement does not count as Pro", async () => {
    const { deps } = setup(async () => customer([{ entitlement_id: "entl_other", expires_at: NOW + DAY }]));
    expect((await handleSubscriptionRefreshRequest(req(), deps)).json.isPro).toBe(false);
  });

  it("no record: RevenueCat 404 saves not-Pro", async () => {
    const { deps, store } = setup(async () =>
      jsonResponse({ type: "resource_missing", message: "Customer not found" }, 404)
    );

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    expect(res).toEqual({ status: 200, json: { isPro: false, expiresAt: null, source: "revenuecat" } });
    expect(store.save).toHaveBeenCalledWith(USER_ID, { is_pro: false, expires_at: null, source: "revenuecat" });
  });
});

describe("POST /api/subscription/refresh — RevenueCat down changes nothing", () => {
  const proRow: Row = { is_pro: true, expires_at: new Date(NOW + 10 * DAY).toISOString(), source: "revenuecat" };

  const cases: Array<[string, () => Promise<Response>]> = [
    ["500 error", async () => jsonResponse({ type: "server_error" }, 500)],
    ["503 unavailable", async () => jsonResponse({ type: "server_error" }, 503)],
    ["429 rate limited", async () => jsonResponse({ type: "rate_limit_error" }, 429)],
    ["401 bad key", async () => jsonResponse({ type: "authentication_error" }, 401)],
    ["network failure", async () => { throw new TypeError("fetch failed"); }],
    ["timeout", async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }],
    ["not JSON", async () => new Response("<html>oops</html>", { status: 200 })],
    ["unexpected shape", async () => jsonResponse({ object: "customer" })],
    ["Pro may be on another page", async () => customer([], { next_page: "/v2/…?starting_after=x" })],
  ];

  it.each(cases)("%s → 502, no write, no mirror", async (_name, reply) => {
    const { deps, store } = setup(reply);
    store.rows.set(USER_ID, proRow);

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    expect(res.status).toBe(502);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.mirrorToProfile).not.toHaveBeenCalled();
    expect(store.rows.get(USER_ID)).toEqual(proRow);
  });

  it("missing RevenueCat settings → 503, no request, no write", async () => {
    const fetchImpl = mockFetch(async () => customer([]));
    const { deps, store } = setup(async () => customer([]), {
      lookupPro: (userId: string) =>
        lookupRevenueCatPro(userId, { config: { ...config, secretKey: "" }, fetchImpl, now: NOW }),
    });

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    expect(res.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("missing Supabase service role → 503 before asking RevenueCat", async () => {
    const { deps, fetchImpl } = setup(async () => customer([]), { store: null });
    expect((await handleSubscriptionRefreshRequest(req(), deps)).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("POST /api/subscription/refresh — legacy grant and comp accounts", () => {
  it("keeps an unexpired legacy grant when RevenueCat says not Pro", async () => {
    const legacy: Row = { is_pro: true, expires_at: new Date(NOW + 5 * DAY).toISOString(), source: "legacy" };
    const { deps, store } = setup(async () => jsonResponse({ type: "resource_missing" }, 404));
    store.rows.set(USER_ID, legacy);

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    expect(res.json).toEqual({ isPro: true, expiresAt: legacy.expires_at, source: "legacy" });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("replaces an expired legacy grant", async () => {
    const { deps, store } = setup(async () => jsonResponse({ type: "resource_missing" }, 404));
    store.rows.set(USER_ID, { is_pro: true, expires_at: new Date(NOW - DAY).toISOString(), source: "legacy" });

    await handleSubscriptionRefreshRequest(req(), deps);

    expect(store.rows.get(USER_ID)).toEqual({ is_pro: false, expires_at: null, source: "revenuecat" });
  });

  it("replaces a legacy grant with the real RevenueCat subscription", async () => {
    const expiresMs = NOW + 300 * DAY;
    const { deps, store } = setup(async () => customer([{ entitlement_id: ENTITLEMENT, expires_at: expiresMs }]));
    store.rows.set(USER_ID, { is_pro: true, expires_at: new Date(NOW + 5 * DAY).toISOString(), source: "legacy" });

    await handleSubscriptionRefreshRequest(req(), deps);

    expect(store.rows.get(USER_ID)?.source).toBe("revenuecat");
    expect(store.rows.get(USER_ID)?.expires_at).toBe(new Date(expiresMs).toISOString());
  });

  it("comp user ID gets Pro with no expiry and RevenueCat is never asked", async () => {
    const { deps, store, fetchImpl } = setup(async () => customer([]), {
      verifyUser: async () => ({ ok: true as const, userId: COMP_ID }),
      compUserIds: parseCompUserIds(COMP_ID.toUpperCase()),
    });

    const res = await handleSubscriptionRefreshRequest(req(), deps);

    expect(res.json).toEqual({ isPro: true, expiresAt: null, source: "comp" });
    expect(store.save).toHaveBeenCalledWith(COMP_ID, { is_pro: true, expires_at: null, source: "comp" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a user removed from the comp list falls back to RevenueCat", async () => {
    const { deps, store } = setup(async () => jsonResponse({ type: "resource_missing" }, 404));
    store.rows.set(USER_ID, { is_pro: true, expires_at: null, source: "comp" });

    await handleSubscriptionRefreshRequest(req(), deps);

    expect(store.rows.get(USER_ID)).toEqual({ is_pro: false, expires_at: null, source: "revenuecat" });
  });

  it("parseCompUserIds accepts commas/spaces and ignores emails and junk", () => {
    const ids = parseCompUserIds(` ${COMP_ID}, ${USER_ID.toUpperCase()}  support@example.com,not-a-uuid,, `);
    expect([...ids].sort()).toEqual([USER_ID, COMP_ID].sort());
    expect(parseCompUserIds(undefined).size).toBe(0);
  });

  it("a mirror failure still returns the saved answer", async () => {
    const { deps, store } = setup(async () => customer([]));
    store.mirrorToProfile.mockRejectedValueOnce(new Error("db down"));
    const res = await handleSubscriptionRefreshRequest(req(), deps);
    expect(res.status).toBe(200);
    expect(store.save).toHaveBeenCalled();
  });

  it("a failed save returns 502", async () => {
    const { deps, store } = setup(async () => customer([]));
    store.save.mockRejectedValueOnce(Object.assign(new Error("Could not save subscription status. Try again."), { statusCode: 502 }));
    expect((await handleSubscriptionRefreshRequest(req(), deps)).status).toBe(502);
  });
});

describe("POST /api/subscription/refresh — auth and rate limits", () => {
  it("401 without a valid token; RevenueCat and the store are never touched", async () => {
    const { deps, store, fetchImpl } = setup(async () => customer([]));
    expect((await handleSubscriptionRefreshRequest(req({ authorization: "" }), deps)).status).toBe(401);
    expect((await handleSubscriptionRefreshRequest(req({ authorization: "Bearer bad" }), deps)).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("checks the IP limit before the token", async () => {
    const { deps } = setup(async () => customer([]), {
      ipLimiter: createTokenBucketLimiter({ capacity: 1, refillIntervalMs: 60_000 }),
    });
    await handleSubscriptionRefreshRequest(req(), deps);
    deps.verifyUser.mockClear();

    const blocked = await handleSubscriptionRefreshRequest(req(), deps);
    expect(blocked.status).toBe(429);
    expect(blocked.headers?.["Retry-After"]).toBeTruthy();
    expect(deps.verifyUser).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-user bucket is empty", async () => {
    const { deps, fetchImpl } = setup(async () => customer([]), {
      userLimiter: createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000 }),
    });
    await handleSubscriptionRefreshRequest(req(), deps);
    await handleSubscriptionRefreshRequest(req(), deps);
    const blocked = await handleSubscriptionRefreshRequest(req(), deps);
    expect(blocked.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("the RevenueCat key is never printed or returned", () => {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  let spies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
  });

  const cases: Array<[string, () => Promise<Response>]> = [
    ["success", async () => customer([{ entitlement_id: ENTITLEMENT, expires_at: NOW + DAY }])],
    ["error echoing the key", async () => jsonResponse({ message: `bad key ${SECRET}` }, 401)],
    ["network error echoing the key", async () => { throw new Error(`failed with ${SECRET}`); }],
  ];

  it.each(cases)("%s", async (_name, reply) => {
    const { deps } = setup(reply);
    const res = await handleSubscriptionRefreshRequest(req(), deps);
    expect(JSON.stringify(res)).not.toContain("SECRET-MARKER");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
