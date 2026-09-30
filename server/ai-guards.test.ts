import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCookRecipesRequest } from "./cook-recipes-http.mjs";
import { handleFridgeVisionRequest } from "./vision-http.mjs";
import { createTokenBucketLimiter } from "./rate-limit.mjs";
import { createDailyCap } from "./daily-cap.mjs";
import { createLruCache } from "./lru-cache.mjs";
import { runCookRecipes } from "./cook-recipes-logic.mjs";
import { clientIp } from "./client-ip.mjs";
import { mockFetch, openAiReply } from "./test-fetch";
import { proQuota } from "./test-quota";

const quota = proQuota();

const verifyUser = async (token: string) =>
  token.startsWith("user-")
    ? { ok: true as const, userId: token }
    : { ok: false as const, status: 401, error: "Invalid or expired session." };

describe("per-IP limit", () => {
  it("blocks many anonymous users behind one IP, even with fresh per-user buckets", async () => {
    const ipLimiter = createTokenBucketLimiter({ capacity: 3, refillIntervalMs: 60_000 });
    const limiter = createTokenBucketLimiter({ capacity: 10, refillIntervalMs: 1_000 });
    const generate = vi.fn(async () => ({ recipes: [] }));

    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const res = await handleCookRecipesRequest(
        { authorization: `Bearer user-anon-${i}`, ip: "198.51.100.1", body: {} },
        { verifyUser, limiter, ipLimiter, generate, quota }
      );
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("tracks IPs independently", async () => {
    const ipLimiter = createTokenBucketLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    const limiter = createTokenBucketLimiter({ capacity: 10, refillIntervalMs: 1_000 });
    const generate = async () => ({ recipes: [] });
    const call = (ip: string) =>
      handleCookRecipesRequest({ authorization: "Bearer user-1", ip, body: {} }, { verifyUser, limiter, ipLimiter, generate, quota });

    expect((await call("198.51.100.1")).status).toBe(200);
    expect((await call("198.51.100.1")).status).toBe(429);
    expect((await call("198.51.100.2")).status).toBe(200);
  });
});

describe("shared per-user bucket", () => {
  it("recipes and vision draw from the same user bucket", async () => {
    const ipLimiter = createTokenBucketLimiter({ capacity: 100, refillIntervalMs: 1_000 });
    const userLimiter = createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000 });
    const auth = { authorization: "Bearer user-1", ip: "198.51.100.1", body: {} };

    const vision = await handleFridgeVisionRequest(auth, {
      verifyUser, userLimiter, ipLimiter, quota, analyze: async () => ({ ingredients: ["eggs"] }),
    });
    const recipes = await handleCookRecipesRequest(auth, {
      verifyUser, limiter: userLimiter, ipLimiter, quota, generate: async () => ({ recipes: [] }),
    });
    const third = await handleCookRecipesRequest(auth, {
      verifyUser, limiter: userLimiter, ipLimiter, quota, generate: async () => ({ recipes: [] }),
    });

    expect([vision.status, recipes.status, third.status]).toEqual([200, 200, 429]);
  });
});

describe("daily cap on recipes", () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  const reply = async () => openAiReply({ recipes: [{ title: "Soup" }] });

  it("cache hits do not count toward the cap", async () => {
    const cache = createLruCache(10);
    const dailyCap = createDailyCap({ max: 1 });
    const fetchImpl = mockFetch(reply);

    await runCookRecipes({ ingredients: ["eggs"] }, { cache, fetchImpl, dailyCap });
    await runCookRecipes({ ingredients: ["eggs"] }, { cache, fetchImpl, dailyCap });
    await runCookRecipes({ ingredients: ["eggs"] }, { cache, fetchImpl, dailyCap });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(dailyCap.used).toBe(1);
  });

  it("a cache miss past the cap returns 503 with Retry-After and skips OpenAI", async () => {
    const cache = createLruCache(10);
    const dailyCap = createDailyCap({ max: 1 });
    const fetchImpl = mockFetch(reply);
    const generate = (body: Record<string, unknown>) => runCookRecipes(body, { cache, fetchImpl, dailyCap });
    const limits = {
      verifyUser,
      limiter: createTokenBucketLimiter({ capacity: 10, refillIntervalMs: 1_000 }),
      ipLimiter: createTokenBucketLimiter({ capacity: 10, refillIntervalMs: 1_000 }),
      generate,
      quota,
    };
    const call = (ingredients: string[]) =>
      handleCookRecipesRequest({ authorization: "Bearer user-1", ip: "198.51.100.1", body: { ingredients } }, limits);

    expect((await call(["eggs"])).status).toBe(200);
    const capped = await call(["tomato"]);
    expect(capped.status).toBe(503);
    expect(Number(capped.headers?.["Retry-After"])).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("limiter memory", () => {
  it("drops idle buckets once maxKeys is reached", () => {
    const limiter = createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 100, maxKeys: 3 });
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 0);
    expect(limiter.size).toBe(3);

    // All three have refilled by t=1000, so adding "d" sweeps them.
    limiter.check("d", 1_000);
    expect(limiter.size).toBe(1);
  });

  it("keeps buckets that are still draining", () => {
    const limiter = createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000, maxKeys: 1 });
    limiter.check("a", 0);
    limiter.check("b", 1);
    expect(limiter.size).toBe(2);
  });
});

describe("clientIp", () => {
  it("prefers req.ip, falls back to the socket, and strips the IPv4-mapped prefix", () => {
    expect(clientIp({ ip: "::ffff:203.0.113.9" })).toBe("203.0.113.9");
    expect(clientIp({ socket: { remoteAddress: "127.0.0.1" } })).toBe("127.0.0.1");
    expect(clientIp({})).toBe("unknown");
  });
});
