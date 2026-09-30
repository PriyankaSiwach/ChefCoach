/**
 * AI scan trial gates.
 *
 * Free tier:
 *   - Cook (fridge): 3 lifetime scans (`recipify_scans_used`)
 *   - Track (food):  3 lifetime scans (`chefcoach_tracker_scans_used`)
 *   Total: 6 free AI scans.
 *
 * Pro: unlimited for both — callers check Pro (proStatus.ts) before these gates.
 */

import { supabase } from "@/lib/supabaseClient";
import {
  incrementUsedCount,
  isQuotaExhausted,
  remainingScans,
} from "@/lib/scanQuota";

export const FREE_SCAN_LIMIT = 3;
/** Separate free quota for Food Tracker (not shared with Cook). */
export const FREE_TRACKER_SCAN_LIMIT = 3;

const KEY_SCANS_USED = "recipify_scans_used";
const KEY_TRACKER_SCANS_USED = "chefcoach_tracker_scans_used";
const KEY_SCANS_LEGACY = "recipify_trial_scans"; // old remaining-based key
const KEY_ENDED_LEGACY = "recipify_trial_ended";
const KEY_EMAIL = "recipify_email";

type EmailCarrier = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{
    provider?: string;
    identity_data?: Record<string, unknown>;
  }> | null;
};

function emailFromUnknown(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed : null;
}

function emailFromIdentityData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  return (
    emailFromUnknown(data.email) ??
    emailFromUnknown(data.email_address) ??
    emailFromUnknown(data.preferred_email)
  );
}

/** Best-effort login email from Supabase user + OAuth identities + localStorage fallback. */
export function resolveAuthEmail(user?: EmailCarrier | null): string | null {
  const fromUser = emailFromUnknown(user?.email);
  if (fromUser) return fromUser;

  const meta = user?.user_metadata ?? {};
  for (const key of ["email", "preferred_email", "user_email"] as const) {
    const v = emailFromUnknown(meta[key]);
    if (v) return v;
  }

  // Apple/Google OAuth often store the sign-in email on the linked identity
  // even when user.email is empty or stale on the session object.
  const identities = user?.identities;
  if (Array.isArray(identities)) {
    const apple = identities.find((i) => i.provider === "apple");
    const appleEmail = emailFromIdentityData(apple?.identity_data);
    if (appleEmail) return appleEmail;

    for (const identity of identities) {
      const identityEmail = emailFromIdentityData(identity.identity_data);
      if (identityEmail) return identityEmail;
    }
  }

  return getStoredEmail()?.trim() ?? null;
}

/** Persist resolved login email for profile display and legacy helpers. */
export function storeAuthEmail(email: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const trimmed = email?.trim();
  try {
    if (trimmed) window.localStorage.setItem(KEY_EMAIL, trimmed);
    else window.localStorage.removeItem(KEY_EMAIL);
  } catch {
    /* ignore */
  }
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(KEY_EMAIL); } catch { return null; }
}

// ─── Local storage helpers ────────────────────────────────────────────────────

function readLocalScansUsed(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(KEY_SCANS_USED);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    // Migrate legacy "remaining" key → "used" key
    const legacyRaw = window.localStorage.getItem(KEY_SCANS_LEGACY);
    if (legacyRaw !== null) {
      const remaining = parseInt(legacyRaw, 10);
      const used = Number.isFinite(remaining) ? Math.max(0, FREE_SCAN_LIMIT - remaining) : 0;
      window.localStorage.setItem(KEY_SCANS_USED, String(used));
      window.localStorage.removeItem(KEY_SCANS_LEGACY);
      window.localStorage.removeItem(KEY_ENDED_LEGACY);
      return used;
    }

    return 0;
  } catch { return 0; }
}

export function writeLocalScansUsed(n: number): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY_SCANS_USED, String(Math.max(0, n))); } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** How many lifetime scans this user has performed (local fast-path). */
export function getScansUsed(): number {
  return readLocalScansUsed();
}

/** How many free scans remain (0 means exhausted). */
export function getTrialScansRemaining(): number {
  return remainingScans(getScansUsed(), FREE_SCAN_LIMIT);
}

/** True when all free scans are used up. */
export function isTrialExhausted(): boolean {
  return isQuotaExhausted(getScansUsed(), FREE_SCAN_LIMIT);
}

/**
 * @deprecated kept for any remaining callers in RecipifyApp.
 * Use {@link isTrialExhausted} instead.
 */
export function getTrialEnded(): boolean {
  return isTrialExhausted();
}

/**
 * Record one scan locally and asynchronously sync to Supabase.
 * Also patches the localStorage profile JSON so `profile.freeScansUsed` stays current.
 * Returns the new local scansUsed count.
 */
export function recordScanUsed(userId?: string | null): number {
  const next = incrementUsedCount(readLocalScansUsed());
  writeLocalScansUsed(next);

  // Patch the local profile JSON so RecipifyApp can derive isPro/scans from profile
  try {
    // Dynamic import to avoid circular dep (trial → profileSupabase → supabaseClient)
    void import("@/lib/profileSupabase").then(({ patchLocalProfileScansUsed }) => {
      patchLocalProfileScansUsed(next);
    });
  } catch { /* ignore */ }

  // Fire-and-forget Supabase sync
  if (userId) void syncScanUsedToSupabase(userId);
  return next;
}

/** The server said the free Cook scans are used: make the on-device counter agree. */
export function markCookFreeScansUsedUp(): void {
  if (readLocalScansUsed() < FREE_SCAN_LIMIT) writeLocalScansUsed(FREE_SCAN_LIMIT);
}

/**
 * @deprecated kept for callers in RecipifyApp.tsx that haven't been updated yet.
 * Calls {@link recordScanUsed} and returns remaining.
 */
export function consumeTrialScan(): number {
  recordScanUsed();
  return getTrialScansRemaining();
}

/**
 * Pull freeScansUsed from profile_data JSON in Supabase and take the max
 * over the local value (so a reinstall can't reset the trial count).
 */
export async function syncScansFromSupabase(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("profile_data")
      .eq("id", userId)
      .maybeSingle();
    if (error || data == null) return;
    const pd = (data as { profile_data?: Record<string, unknown> }).profile_data ?? {};
    const serverUsed = typeof pd.freeScansUsed === "number" ? Math.max(0, pd.freeScansUsed) : 0;
    const localUsed = readLocalScansUsed();
    if (serverUsed > localUsed) writeLocalScansUsed(serverUsed);
  } catch { /* ignore */ }
}

/** Increment freeScansUsed inside profile_data JSONB via migration 004 RPC. */
async function syncScanUsedToSupabase(userId: string): Promise<void> {
  try {
    await supabase.rpc("increment_scans_in_profile", { p_user_id: userId });
  } catch { /* ignore */ }
}

/**
 * Called on app boot to ensure legacy localStorage state is migrated.
 * @deprecated kept for backward compat — migration now happens in readLocalScansUsed.
 */
export function migrateTrialState(): void {
  readLocalScansUsed(); // triggers migration as a side effect
}

/**
 * @deprecated no-op — use writeLocalScansUsed directly.
 */
export function setTrialEnded(_value: boolean): void { /* no-op */ }

// ─── Food Tracker free scans (separate from Cook) ─────────────────────────────

function readLocalTrackerScansUsed(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(KEY_TRACKER_SCANS_USED);
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

function writeLocalTrackerScansUsed(n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_TRACKER_SCANS_USED, String(Math.max(0, n)));
  } catch {
    /* ignore */
  }
}

/** How many lifetime Food Tracker scans this user has performed. */
export function getTrackerScansUsed(): number {
  return readLocalTrackerScansUsed();
}

/** True when all free Food Tracker scans are used up. */
export function isTrackerTrialExhausted(): boolean {
  return isQuotaExhausted(getTrackerScansUsed(), FREE_TRACKER_SCAN_LIMIT);
}

/** The server said the free Track scans are used: make the on-device counter agree. */
export function markTrackFreeScansUsedUp(): void {
  if (readLocalTrackerScansUsed() < FREE_TRACKER_SCAN_LIMIT) {
    writeLocalTrackerScansUsed(FREE_TRACKER_SCAN_LIMIT);
  }
}

/** Record one Food Tracker scan. Returns the new used count. */
export function recordTrackerScanUsed(): number {
  const next = incrementUsedCount(readLocalTrackerScansUsed());
  writeLocalTrackerScansUsed(next);
  return next;
}
