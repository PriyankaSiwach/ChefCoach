import { vi } from "vitest";
import { createKeyedLock, createScanQuota } from "./scan-quota.mjs";

type Row = { is_pro: boolean; expires_at: string | null; source: "revenuecat" | "comp" | "legacy" };

/** In-memory subscriptions + scan_usage, wired into the real createScanQuota. */
export function memoryQuota({
  subscriptions = {} as Record<string, Row>,
  usage = {} as Record<string, number>,
  lookupPro = vi.fn(async () => ({ isPro: false, expiresAt: null as string | null })),
  compUserIds = new Set<string>(),
  now = Date.now,
} = {}) {
  const subRows = new Map(Object.entries(subscriptions));
  const counts = new Map(Object.entries(usage));
  const subs = {
    get: vi.fn(async (userId: string) => subRows.get(userId) ?? null),
    save: vi.fn(async (userId: string, row: Row) => {
      subRows.set(userId, row);
    }),
    mirrorToProfile: vi.fn(async () => {}),
  };
  const store = {
    get: vi.fn(async (userId: string, kind: string) => counts.get(`${userId}:${kind}`) ?? 0),
    increment: vi.fn(async (userId: string, kind: string) => {
      counts.set(`${userId}:${kind}`, (counts.get(`${userId}:${kind}`) ?? 0) + 1);
    }),
  };
  const quota = createScanQuota({ subscriptions: subs, usage: store, lookupPro, compUserIds, now });
  return { quota, subs, store, counts, lookupPro, used: (userId: string, kind: string) => counts.get(`${userId}:${kind}`) ?? 0 };
}

/** A quota that treats everyone as Pro — for tests about other behaviour. */
export function proQuota() {
  return {
    check: async () => ({ pro: true as const }),
    confirmPro: async () => true,
    record: async () => {},
    runExclusive: createKeyedLock(),
  };
}
