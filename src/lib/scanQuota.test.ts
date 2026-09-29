import { describe, expect, it } from "vitest";
import {
  incrementUsedCount,
  isQuotaExhausted,
  remainingScans,
} from "@/lib/scanQuota";

describe("scanQuota", () => {
  it("allows the 3rd free scan and blocks the 4th", () => {
    expect(isQuotaExhausted(0, 3)).toBe(false);
    expect(isQuotaExhausted(2, 3)).toBe(false);
    expect(isQuotaExhausted(3, 3)).toBe(true);
    expect(isQuotaExhausted(4, 3)).toBe(true);
  });

  it("remaining hits 0 at the limit and never goes negative", () => {
    expect(remainingScans(0, 3)).toBe(3);
    expect(remainingScans(2, 3)).toBe(1);
    expect(remainingScans(3, 3)).toBe(0);
    expect(remainingScans(10, 3)).toBe(0);
  });

  it("treats NaN / negative used counts as 0", () => {
    expect(remainingScans(Number.NaN, 3)).toBe(3);
    expect(remainingScans(-2, 3)).toBe(3);
    expect(isQuotaExhausted(Number.NaN, 3)).toBe(false);
  });

  it("does not increment or exhaust when bypass (Pro) is on", () => {
    expect(isQuotaExhausted(99, 3, true)).toBe(false);
    expect(incrementUsedCount(2, true)).toBe(2);
    expect(incrementUsedCount(2, false)).toBe(3);
  });
});
