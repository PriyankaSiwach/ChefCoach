import type { UserProfile } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { normalizeUserProfile, RECIPIFY_PROFILE_STORAGE_KEY } from "@/lib/profileStorage";
import { markOnboardingCompleteOnDevice } from "@/lib/onboardingGate";

// profile_data.isPro / subscriptionExpiresAt are display-only copies written by the
// server. Pro is decided in proStatus.ts; nothing here reads or grants it.

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
  const localScans =
    typeof local.freeScansUsed === "number" ? Math.max(0, local.freeScansUsed) : 0;
  const remoteScans =
    typeof remote.freeScansUsed === "number" ? Math.max(0, remote.freeScansUsed) : 0;

  return {
    ...remote,
    ...local,
    // Only the server writes these (display-only); never keep a copy from this device.
    isPro: remote.isPro,
    subscriptionExpiresAt: remote.subscriptionExpiresAt ?? null,
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

function saveLocalProfile(profile: UserProfile): UserProfile {
  try {
    window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
  return profile;
}

/**
 * After sign-in: merge locally saved onboarding (guest or pre-auth) with the
 * cloud profile, upsert to Supabase, and refresh localStorage.
 */
export async function syncProfileAfterAuth(userId: string): Promise<void> {
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
      saveLocalProfile(local);
    }
    return;
  }

  const rawRemote = data?.profile_data;

  // Cloud empty — push local guest/onboarding profile up
  if (isEmptyRemoteProfile(rawRemote)) {
    if (local) {
      const saved = saveLocalProfile(local);
      await upsertProfileToSupabase(userId, saved);
      markOnboardingCompleteOnDevice();
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

  const normalizedRemote = normalizeUserProfile(rawRemote);
  if (!normalizedRemote) {
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    return;
  }
  // Rows written before the avatar became device-only may still carry one; never pull it down.
  const remote: UserProfile = {
    ...normalizedRemote,
    avatarDataUri: local?.avatarDataUri ?? null,
  };

  // Both exist — merge so guest onboarding answers are not lost
  const merged = local ? mergeProfiles(local, remote) : remote;
  const saved = saveLocalProfile(merged);
  await upsertProfileToSupabase(userId, saved);
  markOnboardingCompleteOnDevice();
}

/** Pull `profiles.profile_data` into localStorage and notify listeners. */
export async function pullProfileFromSupabase(userId: string): Promise<void> {
  await syncProfileAfterAuth(userId);
}

/** The profile picture stays on the device; everything else syncs. */
export function toCloudProfile(profile: UserProfile): UserProfile {
  const cloud = { ...profile };
  delete cloud.avatarDataUri;
  return cloud;
}

export async function upsertProfileToSupabase(
  userId: string,
  profile: UserProfile
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      profile_data: toCloudProfile(profile),
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
