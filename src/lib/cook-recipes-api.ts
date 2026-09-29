import type { DietFilter, RecipeResultItem, TimeFilter, UserGoal, UserProfile } from "@/types";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/apiBase";
import { supabase } from "@/lib/supabaseClient";
import { buildUserDietaryRestrictionsPrompt } from "@/lib/dietConstants";
import { matchRecipesFromIngredients } from "@/lib/fridge-recipe-match";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  mapCookRecipeToResultItem,
  type CookRecipeRaw,
} from "@/lib/cook-recipe-mapper";

export { mapCookRecipeToResultItem } from "@/lib/cook-recipe-mapper";

type CookRecipesResponse = {
  recipes?: CookRecipeRaw[];
  error?: string;
};

export type FetchCookRecipesParams = {
  ingredients: string[];
  dietaryPreference: DietFilter;
  maxCookTime: TimeFilter;
  profile: UserProfile | null;
  count?: number;
  excludeTitles?: string[];
};

function buildRequestBody(params: FetchCookRecipesParams) {
  const { ingredients, dietaryPreference, maxCookTime, profile, count, excludeTitles } = params;
  const goal = (profile?.goal ?? "maintain_weight") as UserGoal;
  const allergies = (profile?.allergies ?? []).filter((a) => a !== "None");
  const dislikedFoods = (profile?.dislikedFoods ?? []).filter(Boolean);
  const dietaryRestrictionsPrompt = buildUserDietaryRestrictionsPrompt(profile);

  return {
    ingredients,
    dietaryPreference,
    maxCookTime,
    goal,
    allergies,
    dislikedFoods,
    dietaryRestrictionsPrompt,
    count: count ?? 4,
    excludeTitles: excludeTitles ?? [],
  };
}

function mapRecipes(
  list: CookRecipeRaw[],
  dietaryPreference: DietFilter,
  count: number,
  excludeTitles: string[]
): RecipeResultItem[] {
  const excluded = new Set(excludeTitles.map((t) => t.toLowerCase()));
  return list
    .map((r) => mapCookRecipeToResultItem(r, dietaryPreference))
    .filter((x): x is RecipeResultItem => x !== null)
    .filter((r) => !excluded.has(r.name.toLowerCase()))
    .slice(0, count);
}

type ServerCookResult =
  | { kind: "ok"; recipes: RecipeResultItem[] }
  | { kind: "rate_limited" }
  | { kind: "miss" };

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* guest / no session */
  }
  return headers;
}

async function tryServerCookRecipes(
  params: FetchCookRecipesParams
): Promise<ServerCookResult> {
  // Native has no loopback API unless a hosted origin is configured.
  if (Capacitor.isNativePlatform() && !(import.meta.env.VITE_API_BASE_URL || "").trim()) {
    return { kind: "miss" };
  }

  const count = Math.min(6, Math.max(1, params.count ?? 4));
  const excludeTitles = params.excludeTitles ?? [];

  try {
    const res = await fetchWithTimeout(apiUrl("/api/cook-recipes"), {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(buildRequestBody(params)),
      timeoutMs: 30_000,
    });

    const data = (await res.json()) as CookRecipesResponse;
    if (res.status === 429) {
      return { kind: "rate_limited" };
    }
    if (!res.ok) {
      console.warn("[cook-recipes] server error:", data.error ?? res.status);
      return { kind: "miss" };
    }

    const list = Array.isArray(data.recipes) ? data.recipes : [];
    const mapped = mapRecipes(list, params.dietaryPreference, count, excludeTitles);
    return mapped.length ? { kind: "ok", recipes: mapped } : { kind: "miss" };
  } catch (e) {
    console.warn("[cook-recipes] server fetch failed:", e);
    return { kind: "miss" };
  }
}

function tryLocalCookRecipes(params: FetchCookRecipesParams): RecipeResultItem[] {
  const count = Math.min(6, Math.max(1, params.count ?? 4));
  const excludeTitles = params.excludeTitles ?? [];
  const local = matchRecipesFromIngredients(params.ingredients, params.profile);
  const excluded = new Set(excludeTitles.map((t) => t.toLowerCase()));
  return local.filter((r) => !excluded.has(r.name.toLowerCase())).slice(0, count);
}

/**
 * Generate cook-tab recipes: server → local library fallback (works offline).
 * Never throws if local library can produce recipes.
 */
export async function fetchCookRecipesFromApi(
  params: FetchCookRecipesParams
): Promise<RecipeResultItem[]> {
  const ingredients = params.ingredients.map((s) => s.trim()).filter(Boolean);
  if (!ingredients.length) {
    throw new Error("Add at least one ingredient before generating recipes.");
  }

  const withIngredients = { ...params, ingredients };

  const fromServer = await tryServerCookRecipes(withIngredients);
  if (fromServer.kind === "ok") {
    return fromServer.recipes;
  }

  if (fromServer.kind === "rate_limited") {
    const fromLocal = tryLocalCookRecipes(withIngredients);
    if (fromLocal.length) return fromLocal;
    throw new Error("Too many recipe requests. Try again in a few minutes.");
  }

  const fromLocal = tryLocalCookRecipes(withIngredients);

  if (fromLocal.length) return fromLocal;

  throw new Error(
    "Could not generate recipes. Check your connection and try again."
  );
}
