import { describe, expect, it, vi } from "vitest";
import { handleFoodVisionRequest, handleFridgeVisionRequest } from "./vision-http.mjs";
import { handleCookRecipesRequest } from "./cook-recipes-http.mjs";
import { createTokenBucketLimiter } from "./rate-limit.mjs";
import { httpError } from "./http-error.mjs";
import { createKeyedLock, createScanQuota, runWithScanQuota } from "./scan-quota.mjs";
import { memoryQuota } from "./test-quota";

const USER = "11111111-2222-4333-8444-555555555555";
const ANON = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + DAY).toISOString();

const limits = () => ({
  verifyUser: async (token: string) =>
    token.startsWith("user:")
      ? { ok: true as const, userId: token.slice(5) }
      : { ok: false as const, status: 401, error: "Invalid or expired session." },
  userLimiter: createTokenBucketLimiter({ capacity: 100, refillIntervalMs: 1_000 }),
  limiter: createTokenBucketLimiter({ capacity: 100, refillIntervalMs: 1_000 }),
  ipLimiter: createTokenBucketLimiter({ capacity: 100, refillIntervalMs: 1_000 }),
});

const auth = (userId = USER) => ({ authorization: `Bearer user:${userId}`, ip: "203.0.113.7" });

function track(quota: unknown, analyze = vi.fn(async () => ({ name: "Salad" })), userId = USER) {
  return {
    analyze,
    call: () => handleFoodVisionRequest({ ...auth(userId), body: {} }, { ...limits(), analyze, quota } as never),
  };
}

function cook(quota: unknown, generate = vi.fn(async () => ({ recipes: [{ title: "Soup" }] })), userId = USER) {
  return {
    generate,
    call: (body: Record<string, unknown> = { ingredients: ["eggs"] }) =>
      handleCookRecipesRequest({ ...auth(userId), body }, { ...limits(), generate, quota } as never),
    fridge: (analyze = vi.fn(async () => ({ ingredients: ["eggs"] }))) =>
      handleFridgeVisionRequest({ ...auth(userId), body: {} }, { ...limits(), analyze, quota } as never),
  };
}

describe("free users", () => {
  it("get 3 Track scans; the 4th is 402 and OpenAI is never called", async () => {
    const m = memoryQuota();
    const t = track(m.quota);

    expect([(await t.call()).status, (await t.call()).status, (await t.call()).status]).toEqual([200, 200, 200]);
    const fourth = await t.call();

    expect(fourth.status).toBe(402);
    expect(fourth.json).toMatchObject({ code: "free_scans_used", kind: "track", limit: 3 });
    expect(t.analyze).toHaveBeenCalledTimes(3);
    expect(m.used(USER, "track")).toBe(3);
  });

  it("get 3 Cook scans; the 4th is 402 before OpenAI", async () => {
    const m = memoryQuota();
    const c = cook(m.quota);

    for (let i = 0; i < 3; i++) expect((await c.call()).status).toBe(200);
    expect((await c.call()).status).toBe(402);
    expect(c.generate).toHaveBeenCalledTimes(3);
    expect(m.used(USER, "cook")).toBe(3);
  });

  it("Cook and Track are counted separately", async () => {
    const m = memoryQuota({ usage: { [`${USER}:cook`]: 3 } });
    expect((await cook(m.quota).call()).status).toBe(402);
    expect((await track(m.quota).call()).status).toBe(200);
  });

  it("the fridge photo check is blocked once Cook scans are used, but never counts on its own", async () => {
    const m = memoryQuota();
    const c = cook(m.quota);
    await c.fridge();
    await c.fridge();
    expect(m.used(USER, "cook")).toBe(0);

    const out = memoryQuota({ usage: { [`${USER}:cook`]: 3 } });
    const analyze = vi.fn(async () => ({ ingredients: ["eggs"] }));
    const blocked = await cook(out.quota).fridge(analyze);
    expect(blocked.status).toBe(402);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("the third Cook run (photo + recipes) still works: photo check at 2 used, recipes count to 3", async () => {
    const m = memoryQuota({ usage: { [`${USER}:cook`]: 2 } });
    const c = cook(m.quota);
    expect((await c.fridge()).status).toBe(200);
    expect((await c.call()).status).toBe(200);
    expect(m.used(USER, "cook")).toBe(3);
    expect((await c.fridge()).status).toBe(402);
  });

  it("'load more' is not counted, and is blocked once scans are used", async () => {
    const m = memoryQuota({ usage: { [`${USER}:cook`]: 1 } });
    const c = cook(m.quota);
    expect((await c.call({ ingredients: ["eggs"], excludeTitles: ["Soup"] })).status).toBe(200);
    expect(m.used(USER, "cook")).toBe(1);

    const out = memoryQuota({ usage: { [`${USER}:cook`]: 3 } });
    expect((await cook(out.quota).call({ ingredients: ["eggs"], excludeTitles: ["Soup"] })).status).toBe(402);
  });

  it("an anonymous account with 3 used scans is blocked", async () => {
    const m = memoryQuota({ usage: { [`${ANON}:track`]: 3, [`${ANON}:cook`]: 3 } });
    const t = track(m.quota, undefined, ANON);
    const c = cook(m.quota, undefined, ANON);

    expect((await t.call()).status).toBe(402);
    expect((await c.call()).status).toBe(402);
    expect(t.analyze).not.toHaveBeenCalled();
    expect(c.generate).not.toHaveBeenCalled();
  });
});

describe("a failed scan never uses up a free scan", () => {
  const failures: Array<[string, () => Promise<never>]> = [
    ["OpenAI error", async () => { throw httpError(502, "Could not analyze this photo. Try again."); }],
    ["daily cap reached", async () => { throw Object.assign(httpError(503, "Busy"), { headers: { "Retry-After": "60" } }); }],
    ["bad request", async () => { throw httpError(400, "Invalid image."); }],
    ["unexpected crash", async () => { throw new Error("boom"); }],
  ];

  it.each(failures)("Track: %s", async (_name, fail) => {
    const m = memoryQuota({ usage: { [`${USER}:track`]: 2 } });
    const res = await track(m.quota, vi.fn(fail)).call();
    expect(res.status).not.toBe(200);
    expect(m.used(USER, "track")).toBe(2);
    expect((await track(m.quota).call()).status).toBe(200);
    expect(m.used(USER, "track")).toBe(3);
  });

  it.each(failures)("Cook: %s", async (_name, fail) => {
    const m = memoryQuota({ usage: { [`${USER}:cook`]: 2 } });
    const res = await cook(m.quota, vi.fn(fail)).call();
    expect(res.status).not.toBe(200);
    expect(m.used(USER, "cook")).toBe(2);
  });
});

describe("Pro users are never blocked and never counted", () => {
  const cases: Array<[string, Parameters<typeof memoryQuota>[0]]> = [
    ["RevenueCat subscriber", { subscriptions: { [USER]: { is_pro: true, expires_at: future(), source: "revenuecat" } } }],
    ["comp row", { subscriptions: { [USER]: { is_pro: true, expires_at: null, source: "comp" } } }],
    ["legacy grant", { subscriptions: { [USER]: { is_pro: true, expires_at: future(), source: "legacy" } } }],
    ["PRO_COMP_USER_IDS", { compUserIds: new Set([USER]) }],
  ];

  it.each(cases)("%s", async (_name, setup) => {
    const m = memoryQuota({ ...setup, usage: { [`${USER}:track`]: 50, [`${USER}:cook`]: 50 } });
    const t = track(m.quota);
    const c = cook(m.quota);
    for (let i = 0; i < 5; i++) {
      expect((await t.call()).status).toBe(200);
      expect((await c.call()).status).toBe(200);
    }
    expect(m.used(USER, "track")).toBe(50);
    expect(m.store.increment).not.toHaveBeenCalled();
  });

  it("an expired subscription is treated as free", async () => {
    const m = memoryQuota({
      subscriptions: { [USER]: { is_pro: true, expires_at: new Date(Date.now() - 1000).toISOString(), source: "legacy" } },
      usage: { [`${USER}:track`]: 3 },
    });
    expect((await track(m.quota).call()).status).toBe(402);
  });

  it("just purchased (row not updated yet): a live RevenueCat check lets them through and saves Pro", async () => {
    const lookupPro = vi.fn(async () => ({ isPro: true, expiresAt: future() }));
    const m = memoryQuota({ usage: { [`${USER}:track`]: 3 }, lookupPro });

    expect((await track(m.quota).call()).status).toBe(200);
    expect(m.subs.save).toHaveBeenCalledWith(USER, expect.objectContaining({ is_pro: true, source: "revenuecat" }));
    expect(m.used(USER, "track")).toBe(3);
  });

  it("RevenueCat is only asked when a free user is out of scans", async () => {
    const lookupPro = vi.fn(async () => ({ isPro: false, expiresAt: null }));
    const m = memoryQuota({ lookupPro });
    await track(m.quota).call();
    expect(lookupPro).not.toHaveBeenCalled();
  });

  it("RevenueCat down while out of scans → 402, not free access", async () => {
    const lookupPro = vi.fn(async () => { throw httpError(502, "down"); });
    const m = memoryQuota({ usage: { [`${USER}:track`]: 3 }, lookupPro });
    expect((await track(m.quota).call()).status).toBe(402);
  });
});

describe("database unreachable → 503, never free access", () => {
  it("subscriptions read fails", async () => {
    const m = memoryQuota();
    m.subs.get.mockRejectedValue(new Error("ECONNREFUSED"));
    const t = track(m.quota);
    const res = await t.call();
    expect(res.status).toBe(503);
    expect(res.headers?.["Retry-After"]).toBeTruthy();
    expect(t.analyze).not.toHaveBeenCalled();
  });

  it("scan count read fails", async () => {
    const m = memoryQuota();
    m.store.get.mockRejectedValue(new Error("timeout"));
    const c = cook(m.quota);
    expect((await c.call()).status).toBe(503);
    expect((await c.fridge()).status).toBe(503);
    expect(c.generate).not.toHaveBeenCalled();
  });

  it("server has no service-role key configured", async () => {
    const quota = createScanQuota({ subscriptions: null, usage: null, compUserIds: new Set() });
    const t = track(quota);
    expect((await t.call()).status).toBe(503);
    expect(t.analyze).not.toHaveBeenCalled();
  });

  it("comp users still work without the database", async () => {
    const quota = createScanQuota({ subscriptions: null, usage: null, compUserIds: new Set([USER]) });
    expect((await track(quota).call()).status).toBe(200);
  });

  it("if saving the +1 fails after a good scan, the user still gets their result", async () => {
    const m = memoryQuota();
    m.store.increment.mockRejectedValue(new Error("write failed"));
    expect((await track(m.quota).call()).status).toBe(200);
  });
});

describe("two requests at once", () => {
  it("only one of two simultaneous requests can use the last free scan", async () => {
    const m = memoryQuota({ usage: { [`${USER}:track`]: 2 } });
    let finish: () => void = () => {};
    const slow = vi.fn(
      () => new Promise<{ name: string }>((resolve) => { finish = () => resolve({ name: "Salad" }); })
    );
    const t = track(m.quota, slow);

    const a = t.call();
    const b = t.call();
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
    finish();

    const statuses = [(await a).status, (await b).status].sort();
    expect(statuses).toEqual([200, 402]);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(m.used(USER, "track")).toBe(3);
  });

  it("a failed first request frees the last scan for the waiting one", async () => {
    const m = memoryQuota({ usage: { [`${USER}:track`]: 2 } });
    const analyze = vi
      .fn()
      .mockRejectedValueOnce(httpError(502, "OpenAI error"))
      .mockResolvedValueOnce({ name: "Salad" });
    const t = track(m.quota, analyze);

    const [a, b] = await Promise.all([t.call(), t.call()]);
    expect([a.status, b.status]).toEqual([502, 200]);
    expect(m.used(USER, "track")).toBe(3);
  });

  it("different users don't wait for each other", async () => {
    const run = createKeyedLock();
    const order: string[] = [];
    let release: () => void = () => {};
    const first = run("a", () => new Promise<void>((r) => { release = () => { order.push("a"); r(); }; }));
    await run("b", async () => { order.push("b"); });
    release();
    await first;
    expect(order).toEqual(["b", "a"]);
  });

  it("runWithScanQuota never calls run when blocked", async () => {
    const m = memoryQuota({ usage: { [`${USER}:cook`]: 3 } });
    const run = vi.fn(async () => "x");
    const out = await runWithScanQuota({ userId: USER, kind: "cook", counted: true }, m.quota, run);
    expect(out.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
