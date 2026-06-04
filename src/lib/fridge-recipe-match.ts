import type { DietFilter, RecipeResultItem, TimeFilter, UserProfile } from "@/types";
import {
  MEAL_INGREDIENTS,
  getSafeMeals,
  isSafeForUser,
  mealHealthFocusScore,
  mealSatisfiesDietLabel,
} from "@/lib/mealFilter";
import type { Meal } from "@/lib/mealLibrary";
import { MEAL_LIBRARY } from "@/lib/mealLibrary";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Estimated cook minutes from steps (used for time filter). */
export function estimateMealCookMinutes(meal: Meal): number {
  return Math.min(120, 10 + meal.steps.length * 9);
}

export function parseCookTimeMinutes(cookTime: string): number | null {
  const m = cookTime.match(/(\d+)\s*(?:min|mins|minute)/i);
  if (m) return parseInt(m[1], 10);
  const h = cookTime.match(/(\d+)\s*(?:hr|hour)/i);
  if (h) return parseInt(h[1], 10) * 60;
  return null;
}

function lineMatchesDetected(line: string, detectedNorm: string[]): boolean {
  const ln = normalize(line);
  if (ln.length < 2) return false;
  for (const d of detectedNorm) {
    if (d.length < 2) continue;
    if (ln.includes(d) || d.includes(ln)) return true;
    const dw = d.split(" ").filter((w) => w.length > 2);
    for (const w of dw) {
      if (ln.includes(w)) return true;
    }
    const lw = ln.split(" ").filter((w) => w.length > 2);
    for (const w of lw) {
      if (d.includes(w)) return true;
    }
  }
  return false;
}

/** Distinct detected strings that match any ingredient line or meal text. */
function matchScoreForMeal(meal: Meal, detected: string[]): { score: number; matchedDetected: string[] } {
  const detectedNorm = detected.map((d) => normalize(d)).filter(Boolean);
  const matchedLower = new Set<string>();

  const mealLines = MEAL_INGREDIENTS[meal.name] ?? [];
  for (const line of mealLines) {
    if (!lineMatchesDetected(line, detectedNorm)) continue;
    for (const orig of detected) {
      const dn = normalize(orig);
      if (dn.length < 2) continue;
      if (lineMatchesDetected(line, [dn])) matchedLower.add(orig.toLowerCase());
    }
  }

  const hay = normalize(`${meal.name} ${meal.description} ${meal.steps.join(" ")}`);
  for (const orig of detected) {
    const dn = normalize(orig);
    if (dn.length < 3) continue;
    if (hay.includes(dn)) matchedLower.add(orig.toLowerCase());
  }

  const matchedDetected = detected.filter((d) => matchedLower.has(d.toLowerCase()));
  return { score: matchedLower.size, matchedDetected };
}

function mealDietLabel(meal: Meal): string {
  if (meal.tags.includes("vegan")) return "Vegan";
  if (meal.tags.includes("vegetarian")) return "Vegetarian";
  if (meal.tags.includes("gluten-free")) return "Gluten-free";
  if (meal.tags.includes("keto")) return "Keto";
  return "Balanced";
}

function inferDifficulty(steps: number): "Easy" | "Medium" | "Hard" {
  if (steps <= 3) return "Easy";
  if (steps <= 5) return "Medium";
  return "Hard";
}

function mealToResult(
  meal: Meal,
  matchedDetected: string[],
  score: number
): RecipeResultItem {
  const mins = estimateMealCookMinutes(meal);
  const lines = MEAL_INGREDIENTS[meal.name] ?? [];
  const matchedLineLower = new Set(
    lines
      .filter((line) =>
        lineMatchesDetected(
          line,
          matchedDetected.map((d) => normalize(d))
        )
      )
      .map((l) => normalize(l))
  );
  const missingOptional = lines.filter((line) => !matchedLineLower.has(normalize(line))).slice(0, 8);

  return {
    name: meal.name,
    cookTime: `${mins} mins`,
    diet: mealDietLabel(meal),
    description: meal.description,
    steps: meal.steps,
    calories: meal.calories,
    protein_g: meal.protein_g,
    carbs_g: meal.carbs_g,
    fat_g: meal.fat_g,
    ingredientsUsed: matchedDetected.length ? matchedDetected : [],
    missingOptionalIngredients: missingOptional,
    difficulty: inferDifficulty(meal.steps.length),
    healthNote:
      score > 0
        ? `Matched ${score} of your detected ingredient${score === 1 ? "" : "s"} from the library.`
        : "Suggested from your profile-safe meal library.",
    substitutions: [],
    hardcodedAllergens: meal.allergens.length ? [...meal.allergens] : undefined,
    ingredientMatchCount: score,
  };
}

export function mealPassesDietFilter(meal: Meal, diet: DietFilter): boolean {
  return mealSatisfiesDietLabel(meal, diet);
}

export function mealPassesTimeFilter(meal: Meal, time: TimeFilter): boolean {
  if (time === "any") return true;
  const max = time === "15" ? 15 : time === "30" ? 30 : 60;
  return estimateMealCookMinutes(meal) <= max;
}

/** Rank library meals by overlap with detected ingredients (safe meals only). */
export function matchRecipesFromIngredients(
  detectedIngredients: string[],
  profile: UserProfile | null
): RecipeResultItem[] {
  const detected = detectedIngredients.map((s) => s.trim()).filter(Boolean);
  const profileNonNull = profile ?? ({} as UserProfile);

  const candidates = MEAL_LIBRARY.filter((m) =>
    profile ? isSafeForUser(m, profile) : true
  );

  const scored = candidates.map((meal) => {
    const { score, matchedDetected } = matchScoreForMeal(meal, detected);
    return { meal, score, matchedDetected };
  });

  const focuses = profile?.healthFocuses?.filter((x) => x !== "none") ?? [];

  const sortByHealthThenName = (
    a: (typeof scored)[number],
    b: (typeof scored)[number]
  ) => {
    if (b.score !== a.score) return b.score - a.score;
    const hb = mealHealthFocusScore(b.meal, focuses);
    const ha = mealHealthFocusScore(a.meal, focuses);
    if (hb !== ha) return hb - ha;
    return a.meal.name.localeCompare(b.meal.name);
  };

  const withHits = scored.filter((s) => s.score > 0).sort(sortByHealthThenName);

  let picked: typeof scored;
  if (withHits.length > 0) {
    picked = withHits.slice(0, 12);
  } else {
    const safe = getSafeMeals(profileNonNull);
    picked = safe
      .map((meal) => ({
        meal,
        score: 0,
        matchedDetected: [] as string[],
      }))
      .sort(sortByHealthThenName)
      .slice(0, 8);
  }

  return picked.map(({ meal, score, matchedDetected }) =>
    mealToResult(meal, matchedDetected, score)
  );
}

function aiRecipePassesDiet(itemDiet: string, diet: DietFilter): boolean {
  if (diet === "None") return true;
  const id = itemDiet.toLowerCase();
  if (diet === "Vegetarian") return id.includes("vegetarian") || id.includes("vegan");
  if (diet === "Vegan") return id.includes("vegan");
  if (diet === "Gluten-free") return id.includes("gluten");
  if (diet === "Keto") return id.includes("keto");
  if (diet === "Pescatarian") {
    return id.includes("pescatarian") || id.includes("vegetarian") || id.includes("vegan") || id.includes("fish");
  }
  if (diet === "Halal") return !id.includes("pork") && !id.includes("bacon");
  return true;
}

/** Client-side filter for cook tab (diet + max cook time). */
export function filterRecipeResults(
  items: RecipeResultItem[],
  diet: DietFilter,
  time: TimeFilter
): RecipeResultItem[] {
  return items.filter((item) => {
    const meal = MEAL_LIBRARY.find((m) => m.name === item.name);
    if (!meal) {
      const mins = parseCookTimeMinutes(item.cookTime) ?? 45;
      if (time !== "any") {
        const max = time === "15" ? 15 : time === "30" ? 30 : 60;
        if (mins > max) return false;
      }
      return aiRecipePassesDiet(item.diet, diet);
    }
    if (!mealPassesDietFilter(meal, diet)) return false;
    if (!mealPassesTimeFilter(meal, time)) return false;
    return true;
  });
}
