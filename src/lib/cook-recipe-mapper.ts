import type { DietFilter, RecipeResultItem } from "@/types";

export type CookRecipeRaw = {
  title?: unknown;
  description?: unknown;
  cookTime?: unknown;
  difficulty?: unknown;
  matchedIngredients?: unknown;
  missingOptionalIngredients?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  allergyWarning?: unknown;
  goalReason?: unknown;
  steps?: unknown;
};

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeDifficulty(v: unknown): "Easy" | "Medium" | "Hard" {
  const s = str(v).toLowerCase();
  if (s.includes("hard")) return "Hard";
  if (s.includes("medium")) return "Medium";
  return "Easy";
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function deriveSteps(description: string): string[] {
  const parts = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (parts.length >= 3) return parts.slice(0, 8);
  return [
    "Gather ingredients and prep as needed.",
    "Cook according to the overview in the description, adjusting heat and timing for your stove.",
    "Taste, adjust seasoning, and serve warm.",
  ];
}

export function mapCookRecipeToResultItem(
  raw: CookRecipeRaw,
  dietLabel: DietFilter
): RecipeResultItem | null {
  const title = str(raw.title);
  if (!title) return null;

  const description = str(raw.description);
  let cookTime = str(raw.cookTime);
  if (!cookTime) cookTime = "30 mins";

  const stepsRaw = stringArray(raw.steps);
  const steps = stepsRaw.length ? stepsRaw : deriveSteps(description || title);

  const matched = stringArray(raw.matchedIngredients);
  const missing = stringArray(raw.missingOptionalIngredients);
  const allergyWarning = str(raw.allergyWarning);
  const goalReason = str(raw.goalReason);

  const dietDisplay = dietLabel === "None" ? "Balanced" : dietLabel;

  let desc = description;
  if (goalReason) desc = desc ? `${desc}\n\nGoal fit: ${goalReason}` : `Goal fit: ${goalReason}`;
  if (allergyWarning) desc = desc ? `${desc}\n\n⚠️ ${allergyWarning}` : `⚠️ ${allergyWarning}`;

  return {
    name: title,
    cookTime,
    diet: dietDisplay,
    description: desc || title,
    steps,
    calories: num(raw.calories, 350),
    protein_g: num(raw.protein, 20),
    carbs_g: num(raw.carbs, 35),
    fat_g: num(raw.fat, 14),
    ingredientsUsed: matched,
    missingOptionalIngredients: missing,
    difficulty: normalizeDifficulty(raw.difficulty),
    healthNote: [goalReason, allergyWarning].filter(Boolean).join(" · "),
    substitutions: [],
    ingredientMatchCount: matched.length,
  };
}
