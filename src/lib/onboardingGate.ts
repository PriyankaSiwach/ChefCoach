/** Persists across logout — never cleared by clearRecipifyLocalSession(). */
export const ONBOARDING_DONE_KEY = "chefcoach_onboarding_done";

export function isOnboardingCompleteOnDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
}

export function markOnboardingCompleteOnDevice(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
}

export function clearOnboardingCompleteOnDevice(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ONBOARDING_DONE_KEY);
}
