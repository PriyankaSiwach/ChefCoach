import { describe, expect, it } from "vitest";
import { createTokenBucketLimiter } from "./rate-limit.mjs";

describe("token bucket rate limit", () => {
  it("blocks requests once the bucket is empty", () => {
    const limiter = createTokenBucketLimiter({
      capacity: 2,
      refillIntervalMs: 5_000,
    });
    const t0 = 1_000_000;

    expect(limiter.check("user-1", t0).allowed).toBe(true);
    expect(limiter.check("user-1", t0 + 1).allowed).toBe(true);

    const blocked = limiter.check("user-1", t0 + 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    // Still empty before any refill time elapses.
    expect(limiter.check("user-1", t0 + 100).allowed).toBe(false);
  });

  it("refills correctly after time passes", () => {
    const refillIntervalMs = 1_000;
    const limiter = createTokenBucketLimiter({
      capacity: 2,
      refillIntervalMs,
    });
    const t0 = 0;

    expect(limiter.check("user-1", t0).allowed).toBe(true);
    expect(limiter.check("user-1", t0).allowed).toBe(true);
    expect(limiter.check("user-1", t0).allowed).toBe(false);

    // One token after one refill interval from the empty check.
    const afterOne = limiter.check("user-1", t0 + refillIntervalMs);
    expect(afterOne.allowed).toBe(true);
    expect(afterOne.remaining).toBe(0);

    // Empty again until more time passes.
    expect(limiter.check("user-1", t0 + refillIntervalMs).allowed).toBe(false);

    // Two intervals of idle from empty → up to capacity (2), spend one → 1 left.
    const afterTwo = limiter.check(
      "user-1",
      t0 + refillIntervalMs + 2 * refillIntervalMs
    );
    expect(afterTwo.allowed).toBe(true);
    expect(afterTwo.remaining).toBe(1);
  });
});
