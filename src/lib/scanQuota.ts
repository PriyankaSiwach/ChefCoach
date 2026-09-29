/** Pure free-tier scan math. No I/O — safe to unit-test without localStorage or Supabase. */

export function normalizeUsedCount(used: number): number {
  return Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
}

/** How many free scans remain. Never negative. */
export function remainingScans(used: number, limit: number): number {
  return Math.max(0, limit - normalizeUsedCount(used));
}

/**
 * True when the user cannot take another free scan.
 * Bypass (Pro / allowlisted email) always returns false.
 */
export function isQuotaExhausted(
  used: number,
  limit: number,
  bypass = false
): boolean {
  if (bypass) return false;
  return normalizeUsedCount(used) >= limit;
}

/**
 * Next lifetime used-count after one scan.
 * Bypass does not increment (unlimited scans, counter unchanged).
 */
export function incrementUsedCount(used: number, bypass = false): number {
  const n = normalizeUsedCount(used);
  return bypass ? n : n + 1;
}
