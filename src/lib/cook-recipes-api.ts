import type { DietFilter, RecipeResultItem, TimeFilter, UserGoal, UserProfile } from "@/types";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/apiBase";
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

async function tryServerCookRecipes(
  params: FetchCookRecipesParams
): Promise<RecipeResultItem[] | null> {
  // iOS/Android always skip server — bundled app has no local API server
  if (Capacitor.isNativePlatform()) {
    return null;
  }

  const count = Math.min(6, Math.max(1, params.count ?? 4));
  const excludeTitles = params.excludeTitles ?? [];

  try {
    const res = await fetchWithTimeout(apiUrl("/api/cook-recipes"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(params)),
      timeoutMs: 30_000,
    });

    const data = (await res.json()) as CookRecipesResponse;
    if (!res.ok) {
      console.warn("[cook-recipes] server error:", data.error ?? res.status);
      return null;
    }

    const list = Array.isArray(data.recipes) ? data.recipes : [];
    const mapped = mapRecipes(list, params.dietaryPreference, count, excludeTitles);
    return mapped.length ? mapped : null;
  } catch (e) {
    console.warn("[cook-recipes] server fetch failed:", e);
    return null;
  }
}

async function tryClientCookRecipes(
  params: FetchCookRecipesParams
): Promise<RecipeResultItem[] | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
  if (!apiKey) return null;

  try {
    const { generateCookRecipesFromOpenAI } = await import("@/lib/generate-cook-recipes");
    const mapped = await generateCookRecipesFromOpenAI(params);
    return mapped.length ? mapped : null;
  } catch (e) {
    console.warn("[cook-recipes] client OpenAI failed:", e);
    return null;
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
 * Generate cook-tab recipes: server (web dev) → client OpenAI → local library fallback.
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
  if (fromServer?.length) {
    return fromServer;
  }

  const fromClient = await tryClientCookRecipes(withIngredients);
  if (fromClient?.length) {
    return fromClient;
  }

  const fromLocal = tryLocalCookRecipes(withIngredients);

  if (fromLocal.length) return fromLocal;

  throw new Error(
    "Could not generate recipes. Check your connection and try again."
  );
}
