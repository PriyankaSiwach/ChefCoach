import type { UserProfile } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { isProBypassEmail, resolveAuthEmail } from "@/lib/trial";
import { isProSubscriptionActive, normalizeUserProfile, RECIPIFY_PROFILE_STORAGE_KEY } from "@/lib/profileStorage";
import { markOnboardingCompleteOnDevice } from "@/lib/onboardingGate";

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

/** Grant lifetime Pro in Supabase + localStorage for bypass emails. */
export async function ensureProBypassForUser(
  userId: string,
  email?: string | null
): Promise<void> {
  const authEmail = email ?? resolveAuthEmail(null);
  if (!isProBypassEmail(authEmail)) return;
  await setProStatus(userId, true, null);
}

function readLocalProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeUserProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isEmptyRemoteProfile(raw: unknown): boolean {
  return (
    raw == null ||
    (typeof raw === "object" && raw !== null && Object.keys(raw as object).length === 0)
  );
}

/** Merge guest/local onboarding data with an existing cloud profile without losing either. */
function mergeProfiles(local: UserProfile, remote: UserProfile): UserProfile {
  const localPro = isProSubscriptionActive(local);
  const remotePro = isProSubscriptionActive(remote);
  const localScans =
    typeof local.freeScansUsed === "number" ? Math.max(0, local.freeScansUsed) : 0;
  const remoteScans =
    typeof remote.freeScansUsed === "number" ? Math.max(0, remote.freeScansUsed) : 0;

  return {
    ...remote,
    ...local,
    // Keep the best subscription state from either source
    isPro: localPro || remotePro,
    subscriptionExpiresAt:
      localPro && !remotePro
        ? local.subscriptionExpiresAt ?? null
        : remote.subscriptionExpiresAt ?? local.subscriptionExpiresAt ?? null,
    freeScansUsed: Math.max(localScans, remoteScans),
    // Prefer a real name over the guest placeholder
    name:
      (local.name?.trim() && local.name.trim() !== "Guest"
        ? local.name.trim()
        : "") ||
      remote.name?.trim() ||
      local.name?.trim() ||
      "",
  };
}

function saveLocalProfile(profile: UserProfile, email?: string | null): UserProfile {
  const authEmail = email ?? resolveAuthEmail(null);
  const profileToSave = isProBypassEmail(authEmail)
    ? { ...profile, isPro: true, subscriptionExpiresAt: null }
    : profile;

  try {
    window.localStorage.setItem(
      RECIPIFY_PROFILE_STORAGE_KEY,
      JSON.stringify(profileToSave)
    );
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
  return profileToSave;
}

/**
 * After sign-in: merge locally saved onboarding (guest or pre-auth) with the
 * cloud profile, upsert to Supabase, and refresh localStorage.
 */
export async function syncProfileAfterAuth(
  userId: string,
  email?: string | null
): Promise<void> {
  const local = readLocalProfile();

  const { data, error } = await supabase
    .from("profiles")
    .select("profile_data")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Supabase profile fetch:", error.message);
    if (local) {
      await upsertProfileToSupabase(userId, local);
      saveLocalProfile(local, email);
    }
    return;
  }

  const rawRemote = data?.profile_data;

  // Cloud empty — push local guest/onboarding profile up
  if (isEmptyRemoteProfile(rawRemote)) {
    if (local) {
      const saved = saveLocalProfile(local, email);
      await upsertProfileToSupabase(userId, saved);
      markOnboardingCompleteOnDevice();
      if (isProBypassEmail(email ?? resolveAuthEmail(null))) {
        await setProStatus(userId, true, null);
      }
    } else {
      try {
        window.localStorage.removeItem(RECIPIFY_PROFILE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    }
    return;
  }

  const remote = normalizeUserProfile(rawRemote);
  if (!remote) {
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    return;
  }

  // Both exist — merge so guest onboarding answers are not lost
  const merged = local ? mergeProfiles(local, remote) : remote;
  const saved = saveLocalProfile(merged, email);
  await upsertProfileToSupabase(userId, saved);
  markOnboardingCompleteOnDevice();

  if (isProBypassEmail(email ?? resolveAuthEmail(null))) {
    await setProStatus(userId, true, null);
  }
}

/** Pull `profiles.profile_data` into localStorage and notify listeners. */
export async function pullProfileFromSupabase(
  userId: string,
  email?: string | null
): Promise<void> {
  await syncProfileAfterAuth(userId, email);
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
