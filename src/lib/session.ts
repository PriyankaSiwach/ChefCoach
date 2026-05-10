/** Removes all app keys from localStorage (prefix `recipify_`). */
export function clearRecipifyLocalSession(): void {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith("recipify_")) toRemove.push(k);
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
}
