const KEY = "recipify_recipe_ratings";

export type RecipeRatingEntry = {
  stars: 1 | 2 | 3 | 4 | 5;
  note?: string;
  updatedAt: string;
};

export type RecipeRatingsStore = Record<string, RecipeRatingEntry>;

function read(): RecipeRatingsStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as RecipeRatingsStore;
    return typeof p === "object" && p !== null ? p : {};
  } catch {
    return {};
  }
}

function write(store: RecipeRatingsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getRecipeRating(recipeName: string): RecipeRatingEntry | null {
  const s = read()[recipeName];
  if (!s || typeof s.stars !== "number") return null;
  return s;
}

export function setRecipeRating(
  recipeName: string,
  stars: 1 | 2 | 3 | 4 | 5,
  note?: string
): void {
  const store = read();
  store[recipeName] = {
    stars,
    note: note?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  write(store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("recipify-ratings-changed"));
  }
}

export function getAverageRatingDisplay(recipeName: string): string | null {
  const r = getRecipeRating(recipeName);
  if (!r) return null;
  return "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
}
