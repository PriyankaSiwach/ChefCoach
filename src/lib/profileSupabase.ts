import type { UserProfile } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { isProSubscriptionActive, normalizeUserProfile, RECIPIFY_PROFILE_STORAGE_KEY } from "@/lib/profileStorage";

// ─── Subscription / Pro status ────────────────────────────────────────────────
// Subscription fields (isPro, freeScansUsed, subscriptionExpiresAt) are stored
// INSIDE the profile_data JSONB column, not as separate columns.

export type ProStatus = {
  isPro: boolean;
  expiresAt: Date | null;
  freeScansUsed: number;
};

/**
 * Read subscription status from Supabase (server-authoritative).
 * Reads directly from profile_data JSON — no separate columns needed.
 */
export async function fetchProStatus(userId: string): Promise<ProStatus> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("profile_data")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return { isPro: false, expiresAt: null, freeScansUsed: 0 };

    const pd = data.profile_data as Record<string, unknown> | null;
    if (!pd) return { isPro: false, expiresAt: null, freeScansUsed: 0 };

    const rawExpiry = typeof pd.subscriptionExpiresAt === "string" ? pd.subscriptionExpiresAt : null;
    const expiresAt = rawExpiry ? new Date(rawExpiry) : null;
    const isPro = pd.isPro === true && (expiresAt === null || expiresAt > new Date());
    const freeScansUsed =
      typeof pd.freeScansUsed === "number" ? Math.max(0, pd.freeScansUsed) : 0;

    return { isPro, expiresAt, freeScansUsed };
  } catch {
    return { isPro: false, expiresAt: null, freeScansUsed: 0 };
  }
}

/**
 * Merge subscription fields into profile_data via the `update_profile_subscription` RPC.
 * Also patches localStorage immediately so the UI reflects the change without a page reload.
 */
export async function setProStatus(
  userId: string,
  isPro: boolean,
  expiresAt: Date | null
): Promise<void> {
  // 1. Optimistically patch localStorage profile so UI reacts instantly
  patchLocalProfileSubscription(isPro, expiresAt);

  // 2. Atomically merge into Supabase profile_data via SQL RPC
  try {
    await supabase.rpc("update_profile_subscription", {
      p_user_id: userId,
      p_is_pro: isPro,
      p_expires_at: expiresAt?.toISOString() ?? null,
    });
  } catch { /* ignore — local state already updated */ }
}

/** Patch the cached profile in localStorage with new subscription values. */
export function patchLocalProfileSubscription(isPro: boolean, expiresAt: Date | null): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      parsed.isPro = isPro;
      parsed.subscriptionExpiresAt = expiresAt?.toISOString() ?? null;
      window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
    }
    window.dispatchEvent(new CustomEvent("recipify-subscription-changed"));
  } catch { /* ignore */ }
}

/**
 * Patch freeScansUsed inside the cached profile in localStorage.
 * Called after each scan so the profile object stays in sync.
 */
export function patchLocalProfileScansUsed(scansUsed: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      parsed.freeScansUsed = scansUsed;
      window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch { /* ignore */ }
}

// Re-export so callers don't need to import from profileStorage separately
export { isProSubscriptionActive };

/** Pull `profiles.profile_data` into localStorage and notify listeners. */
export async function pullProfileFromSupabase(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("profile_data")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Supabase profile fetch:", error.message);
    return;
  }

  const raw = data?.profile_data;
  if (raw == null || (typeof raw === "object" && raw !== null && Object.keys(raw as object).length === 0)) {
    try {
      window.localStorage.removeItem(RECIPIFY_PROFILE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    return;
  }

  const normalized = normalizeUserProfile(raw);
  if (!normalized) {
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    return;
  }

  try {
    window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
}

export async function upsertProfileToSupabase(
  userId: string,
  profile: UserProfile
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      profile_data: profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) return { error: error.message };
  return { error: null };
}

/** Used when user chooses “reset account” — removes cloud row so login sync does not restore old profile. */
export async function deleteRemoteProfile(userId: string): Promise<void> {
  await supabase.from("profiles").delete().eq("id", userId);
}
