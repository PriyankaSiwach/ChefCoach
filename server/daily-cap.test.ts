import { describe, expect, it } from "vitest";
import { consumeDailyCapOrThrow, createDailyCap } from "./daily-cap.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("daily OpenAI cap", () => {
  it("allows up to max calls per UTC day, then blocks until midnight UTC", () => {
    const cap = createDailyCap({ max: 2 });
    const noonUtc = Date.UTC(2026, 8, 28, 12, 0, 0);

    expect(cap.tryConsume(noonUtc).allowed).toBe(true);
    expect(cap.tryConsume(noonUtc + 1).allowed).toBe(true);

    const blocked = cap.tryConsume(noonUtc + 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(DAY_MS / 2 - 2);
  });

  it("resets on the next UTC day", () => {
    const cap = createDailyCap({ max: 1 });
    const lateUtc = Date.UTC(2026, 8, 28, 23, 59, 59);

    expect(cap.tryConsume(lateUtc).allowed).toBe(true);
    expect(cap.tryConsume(lateUtc).allowed).toBe(false);
    expect(cap.tryConsume(Date.UTC(2026, 8, 29, 0, 0, 0)).allowed).toBe(true);
  });

  it("throws a 503 with Retry-After when the cap is spent", () => {
    const cap = createDailyCap({ max: 1 });
    consumeDailyCapOrThrow(cap);

    type Caught = { statusCode?: number; headers?: Record<string, string> };
    let caught: Caught | null = null;
    try {
      consumeDailyCapOrThrow(cap);
    } catch (e) {
      caught = e as Caught;
    }
    expect(caught?.statusCode).toBe(503);
    expect(Number(caught?.headers?.["Retry-After"])).toBeGreaterThan(0);
  });
});
