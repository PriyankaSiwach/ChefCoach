import { clearOnboardingCompleteOnDevice } from "@/lib/onboardingGate";
import { RECIPIFY_PROFILE_STORAGE_KEY } from "@/lib/profileStorage";

/** Removes all app keys from localStorage (prefix `recipify_`) and the canonical profile key. */
export function clearRecipifyLocalSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECIPIFY_PROFILE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith("recipify_")) toRemove.push(k);
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
}

/** Full local reset when the user deletes their account. */
export function clearAccountOnDevice(): void {
  clearRecipifyLocalSession();
  clearOnboardingCompleteOnDevice();
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("chefcoach_")) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
    window.localStorage.removeItem("recipify_last_login_email");
    window.localStorage.removeItem("recipify_biometric_eligible");
  } catch {
    /* ignore */
  }
}

/** Hard navigation — resets React state after account deletion. */
export function redirectToLoginAfterAccountReset(): void {
  if (typeof window === "undefined") return;
  const base = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`${base}#/login`);
  window.location.reload();
}
