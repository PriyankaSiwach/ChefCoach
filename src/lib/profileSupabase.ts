import type { UserProfile } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { normalizeUserProfile, RECIPIFY_PROFILE_STORAGE_KEY } from "@/lib/profileStorage";

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
