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
