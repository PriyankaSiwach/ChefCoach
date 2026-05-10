import { formatLocalDate } from "@/lib/gamification";

const KEY = "recipify_pantry_v1";

export type PantryItem = {
  id: string;
  name: string;
  /** Optional best-before or use-by (YYYY-MM-DD) */
  expiryYmd: string | null;
  addedAt: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function readPantry(): PantryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is PantryItem => x != null && typeof x === "object")
      .map((x) => ({
        id: typeof x.id === "string" ? x.id : newId(),
        name: typeof x.name === "string" ? x.name : "Item",
        expiryYmd: typeof x.expiryYmd === "string" ? x.expiryYmd : null,
        addedAt: typeof x.addedAt === "string" ? x.addedAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function writePantry(items: PantryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("recipify-pantry-changed"));
  } catch {
    /* ignore */
  }
}

export function addPantryItem(name: string, expiryYmd: string | null): PantryItem[] {
  const n = normalizeName(name);
  if (!n) return readPantry();
  const items = readPantry();
  const item: PantryItem = {
    id: newId(),
    name: n.replace(/\b\w/g, (c) => c.toUpperCase()),
    expiryYmd: expiryYmd || null,
    addedAt: new Date().toISOString(),
  };
  writePantry([...items, item]);
  return readPantry();
}

export function removePantryItem(id: string): void {
  writePantry(readPantry().filter((x) => x.id !== id));
}

export function mergeIngredientsIntoPantry(ingredients: string[]): PantryItem[] {
  const existing = readPantry();
  const seen = new Set(existing.map((x) => normalizeName(x.name)));
  const added: PantryItem[] = [];
  for (const raw of ingredients) {
    const nn = normalizeName(raw);
    if (!nn || seen.has(nn)) continue;
    seen.add(nn);
    added.push({
      id: newId(),
      name: nn.replace(/\b\w/g, (c) => c.toUpperCase()),
      expiryYmd: null,
      addedAt: new Date().toISOString(),
    });
  }
  writePantry([...existing, ...added]);
  return readPantry();
}

/** Soonest expiry first; items without dates last. */
export function sortPantryUseFirst(items: PantryItem[]): PantryItem[] {
  const today = formatLocalDate(new Date());
  const dayDiff = (e: string | null) => {
    if (!e) return 99999;
    return Math.round(
      (new Date(`${e}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) /
        86400000
    );
  };
  return [...items].sort((a, b) => dayDiff(a.expiryYmd) - dayDiff(b.expiryYmd));
}

export function getExpiringSoon(items: PantryItem[], withinDays: number): PantryItem[] {
  const today = new Date();
  return items.filter((it) => {
    if (!it.expiryYmd) return false;
    const d = new Date(`${it.expiryYmd}T12:00:00`);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    return diff >= 0 && diff <= withinDays;
  });
}
