import { describe, expect, it, vi } from "vitest";
import { handleCookRecipesRequest } from "./cook-recipes-http.mjs";
import { createTokenBucketLimiter } from "./rate-limit.mjs";
import { httpError } from "./http-error.mjs";

function deps(overrides = {}) {
  return {
    verifyUser: async (token: string) =>
      token === "good"
        ? { ok: true as const, userId: "user-1" }
        : { ok: false as const, status: 401, error: "Invalid or expired session." },
    limiter: createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000 }),
    generate: vi.fn(async () => ({ recipes: [{ title: "Soup" }] })),
    ...overrides,
  };
}

describe("handleCookRecipesRequest", () => {
  it("returns 401 when the Authorization header is missing or invalid", async function () {
    const d = deps();
    const missing = await handleCookRecipesRequest({ authorization: "", body: {} }, d);
    expect(missing.status).toBe(401);
    expect(d.generate).not.toHaveBeenCalled();

    const bad = await handleCookRecipesRequest(
      { authorization: "Bearer nope", body: {} },
      d
    );
    expect(bad.status).toBe(401);
    expect(d.generate).not.toHaveBeenCalled();
  });

  it("returns 429 after the per-user limit without calling OpenAI", async function () {
    const d = deps();
    const req = { authorization: "Bearer good", body: { ingredients: ["eggs"] } };

    expect((await handleCookRecipesRequest(req, d)).status).toBe(200);
    expect((await handleCookRecipesRequest(req, d)).status).toBe(200);
    const blocked = await handleCookRecipesRequest(req, d);
    expect(blocked.status).toBe(429);
    expect(blocked.headers?.["Retry-After"]).toBeTruthy();
    expect(blocked.json.error).toMatch(/too many requests/i);
    expect(d.generate).toHaveBeenCalledTimes(2);
  });

  it("maps validation failures to 400", async function () {
    const d = deps({
      generate: async () => {
        throw httpError(400, "At least one ingredient is required.");
      },
    });
    const res = await handleCookRecipesRequest(
      { authorization: "Bearer good", body: {} },
      d
    );
    expect(res.status).toBe(400);
  });
});
