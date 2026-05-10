import type { WeeklyMealPlan } from "@/lib/meal-plan";
import { normalizePantryName } from "@/lib/grocery-helpers";

const KEY = "recipify_grocery_v1";

export type GroceryItem = {
  id: string;
  label: string;
  checked: boolean;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readGroceryList(): GroceryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is GroceryItem => x != null && typeof x === "object")
      .map((x) => ({
        id: typeof x.id === "string" ? x.id : newId(),
        label: typeof x.label === "string" ? x.label : "",
        checked: Boolean(x.checked),
      }))
      .filter((x) => x.label.trim());
  } catch {
    return [];
  }
}

export function writeGroceryList(items: GroceryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("recipify-grocery-changed"));
  } catch {
    /* ignore */
  }
}

export function addGroceryLine(label: string): void {
  const t = label.trim();
  if (!t) return;
  const items = readGroceryList();
  writeGroceryList([
    ...items,
    { id: newId(), label: t, checked: false },
  ]);
}

export function toggleGroceryItem(id: string): void {
  writeGroceryList(
    readGroceryList().map((x) => (x.id === id ? { ...x, checked: !x.checked } : x))
  );
}

export function removeGroceryItem(id: string): void {
  writeGroceryList(readGroceryList().filter((x) => x.id !== id));
}

/** Append labels not already present (case-insensitive). */
export function mergeGroceryLabels(labels: string[]): void {
  const existing = readGroceryList();
  const seen = new Set(existing.map((x) => x.label.toLowerCase()));
  const next = [...existing];
  for (const label of labels) {
    const t = label.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    next.push({ id: newId(), label: t, checked: false });
  }
  writeGroceryList(next);
}

export function clearCheckedGrocery(): void {
  writeGroceryList(readGroceryList().filter((x) => !x.checked));
}

/** Extract rough "ingredient-like" tokens from meal plan text and add lines not in pantry. */
export function suggestGroceryFromPlan(
  plan: WeeklyMealPlan,
  pantryNamesNormalized: Set<string>
): string[] {
  const suggestions = new Set<string>();
  for (const d of plan.days) {
    for (const slot of [d.breakfast, d.lunch, d.dinner]) {
      const parts = slot.split(/[,/&+]|\s+and\s+/i);
      for (const part of parts) {
        const t = part.replace(/^[\s\-\u2022]+|[\s\-\u2022]+$/g, "").trim();
        if (t.length < 2 || t.length > 48) continue;
        const n = normalizePantryName(t);
        if (!n || pantryNamesNormalized.has(n)) continue;
        if (/^\d/.test(t)) continue;
        suggestions.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
      }
    }
  }
  return [...suggestions].slice(0, 24);
}
