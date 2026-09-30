import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleFoodVisionRequest, handleFridgeVisionRequest } from "./vision-http.mjs";
import { createTokenBucketLimiter } from "./rate-limit.mjs";
import { consumeDailyCapOrThrow, createDailyCap } from "./daily-cap.mjs";
import { runFridgeVision } from "./vision-logic.mjs";
import { jpegBase64 } from "./test-images";
import { jsonResponse, mockFetch, openAiReply } from "./test-fetch";
import { proQuota } from "./test-quota";

const SECRET_PHOTO = jpegBase64("PHOTO-SECRET-MARKER-0123456789");

function deps(overrides = {}) {
  return {
    verifyUser: vi.fn(async (token: string) =>
      token === "good"
        ? { ok: true as const, userId: "user-1" }
        : { ok: false as const, status: 401, error: "Invalid or expired session." }
    ),
    userLimiter: createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000 }),
    ipLimiter: createTokenBucketLimiter({ capacity: 5, refillIntervalMs: 60_000 }),
    analyze: vi.fn(async () => ({ ingredients: ["eggs"] })),
    quota: proQuota(),
    ...overrides,
  };
}

const req = (overrides = {}) => ({
  authorization: "Bearer good",
  ip: "203.0.113.7",
  body: { imageBase64: SECRET_PHOTO, mimeType: "image/jpeg" },
  ...overrides,
});

describe("vision endpoints", () => {
  it("returns 200 with the analysis result", async () => {
    const d = deps();
    const res = await handleFridgeVisionRequest(req(), d);
    expect(res).toEqual({ status: 200, json: { ingredients: ["eggs"] } });
  });

  it("returns 401 without a valid token and never analyzes", async () => {
    const d = deps();
    expect((await handleFridgeVisionRequest(req({ authorization: "" }), d)).status).toBe(401);
    expect((await handleFoodVisionRequest(req({ authorization: "Bearer bad" }), d)).status).toBe(401);
    expect(d.analyze).not.toHaveBeenCalled();
  });

  it("checks the IP limit before the token, so blocked IPs never reach Supabase", async () => {
    const d = deps({ ipLimiter: createTokenBucketLimiter({ capacity: 1, refillIntervalMs: 60_000 }) });
    await handleFridgeVisionRequest(req(), d);
    d.verifyUser.mockClear();

    const blocked = await handleFridgeVisionRequest(req(), d);
    expect(blocked.status).toBe(429);
    expect(blocked.headers?.["Retry-After"]).toBeTruthy();
    expect(d.verifyUser).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-user bucket is empty", async () => {
    const d = deps();
    await handleFridgeVisionRequest(req(), d);
    await handleFoodVisionRequest(req(), d);
    const blocked = await handleFridgeVisionRequest(req(), d);
    expect(blocked.status).toBe(429);
    expect(blocked.json.error).toMatch(/too many requests/i);
    expect(d.analyze).toHaveBeenCalledTimes(2);
  });

  it("passes the daily-cap 503 through with Retry-After", async () => {
    const cap = createDailyCap({ max: 1 });
    cap.tryConsume();
    const d = deps({ analyze: async () => consumeDailyCapOrThrow(cap) });
    const res = await handleFoodVisionRequest(req(), d);
    expect(res.status).toBe(503);
    expect(Number(res.headers?.["Retry-After"])).toBeGreaterThan(0);
  });
});

describe("photo data is never logged or echoed", () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  let spies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  const cases: Array<[string, () => Promise<Response>]> = [
    ["success", async () => openAiReply({ ingredients: ["eggs"] })],
    ["OpenAI error", async () => jsonResponse({ error: { message: SECRET_PHOTO } }, 400)],
    ["network failure", async () => { throw new Error(`socket closed ${SECRET_PHOTO}`); }],
    ["garbage reply", async () => openAiReply(SECRET_PHOTO)],
  ];

  it.each(cases)("%s", async (_name, reply) => {
    const fetchImpl = mockFetch(reply);
    const d = deps({
      analyze: (body: Record<string, unknown>) =>
        runFridgeVision(body, { fetchImpl, dailyCap: createDailyCap({ max: 5 }) }),
    });

    const res = await handleFridgeVisionRequest(req(), d);

    expect(JSON.stringify(res)).not.toContain("PHOTO-SECRET");
    expect(JSON.stringify(res)).not.toContain(SECRET_PHOTO);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
