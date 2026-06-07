import type { DietFilter, TimeFilter, UserGoal, UserProfile } from "@/types";
import { buildUserDietaryRestrictionsPrompt } from "@/lib/dietConstants";
import { profilePromptExtras } from "@/lib/profile-prompt";
import { mapCookRecipeToResultItem, type CookRecipeRaw } from "@/lib/cook-recipe-mapper";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { Capacitor } from "@capacitor/core";

export type GenerateCookRecipesParams = {
  ingredients: string[];
  dietaryPreference: DietFilter;
  maxCookTime: TimeFilter;
  profile: UserProfile | null;
  count?: number;
  excludeTitles?: string[];
};

function cookTimeMinutesCap(maxCookTime: TimeFilter): number | null {
  if (maxCookTime === "15") return 15;
  if (maxCookTime === "30") return 30;
  if (maxCookTime === "60") return 60;
  return null;
}

function buildCookRecipesPrompt(params: GenerateCookRecipesParams): string {
  const {
    ingredients,
    dietaryPreference,
    maxCookTime,
    profile,
    count = 4,
    excludeTitles = [],
  } = params;

  const goal = (profile?.goal ?? "maintain_weight") as UserGoal;
  const cap = cookTimeMinutesCap(maxCookTime);
  const timeRule =
    cap == null
      ? "No strict time limit."
      : `Active cook + prep must fit within about ${cap} minutes total.`;

  const dietaryRestrictionsPrompt = buildUserDietaryRestrictionsPrompt(profile);
  const restrictionLine =
    dietaryRestrictionsPrompt.trim() ||
    (dietaryPreference !== "None"
      ? `User is ${dietaryPreference.toLowerCase()} — never include conflicting ingredients.`
      : "No specific dietary restrictions listed.");

  const dietRules: string[] = [];
  if (dietaryPreference === "Halal") {
    dietRules.push("No pork, bacon, ham, or alcohol in any recipe or step.");
  }
  if (dietaryPreference === "Pescatarian") {
    dietRules.push("No meat or poultry; fish and seafood are allowed.");
  }

  const excludeRule =
    excludeTitles.length > 0
      ? `- Do NOT reuse these titles (already suggested): ${JSON.stringify(excludeTitles)}`
      : "";

  const profileExtras = profile ? profilePromptExtras(profile) : "";

  return `You suggest practical home recipes. Output ONLY valid JSON (no markdown).

Schema:
{"recipes":[{"title":"string","description":"string (2-4 sentences)","cookTime":"string like \\"25 mins\\"","difficulty":"Easy"|"Medium"|"Hard","matchedIngredients":["strings from user list actually used"],"missingOptionalIngredients":["extras that would help but aren't required"],"calories":number,"protein":number,"carbs":number,"fat":number,"allergyWarning":"string; empty string if none","goalReason":"one sentence why this fits the user's goal","steps":["4-7 short imperative cooking steps"]}]}

Rules:
- Return exactly ${count} recipes in "recipes".
- Each recipe must primarily use ingredients from the user's list; matchedIngredients must be a subset of those ingredient strings (case-insensitive OK but copy wording from list when possible).
- Every matchedIngredients entry MUST correspond to an item the user scanned — do not claim ingredients that are not in the user list.
- Respect dietary preference: ${dietaryPreference}.
${dietRules.length ? dietRules.map((r) => `- ${r}`).join("\n") : ""}
- ${timeRule}
- User goal: ${goal}. Tailor goalReason (e.g. higher protein for build_muscle, lighter for lose_weight).
- Dietary restrictions: ${restrictionLine}
- Numbers for calories and macros should be realistic per serving for one main portion.
- Titles must be unique and appetizing.
${excludeRule}
${profileExtras ? `- Profile context:${profileExtras}` : ""}

User ingredients (JSON array): ${JSON.stringify(ingredients)}`;
}

/** Cook-tab: generate recipes from scanned ingredients via client-side OpenAI. */
export async function generateCookRecipesFromOpenAI(params: GenerateCookRecipesParams) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing OpenAI key. Set VITE_OPENAI_API_KEY in .env.local.");
  }

  const ingredients = params.ingredients.map((s) => s.trim()).filter(Boolean);
  if (!ingredients.length) {
    throw new Error("Add at least one ingredient before generating recipes.");
  }

  const count = Math.min(6, Math.max(1, params.count ?? 4));
  const excludeTitles = params.excludeTitles ?? [];
  const prompt = buildCookRecipesPrompt({ ...params, count, ingredients });

  const isNative = Capacitor.isNativePlatform();
  const recipeTimeoutMs = isNative ? 45_000 : 75_000;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: count <= 2 ? 1800 : 3200,
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
    timeoutMs: recipeTimeoutMs,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(err.error?.message ?? "Recipe generation failed. Try again.");
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed: { recipes?: CookRecipeRaw[] };
  try {
    parsed = JSON.parse(raw) as { recipes?: CookRecipeRaw[] };
  } catch {
    throw new Error("Could not parse recipe response. Try again.");
  }

  const list = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  const excluded = new Set(excludeTitles.map((t) => t.toLowerCase()));
  const mapped = list
    .map((r) => mapCookRecipeToResultItem(r, params.dietaryPreference))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((r) => !excluded.has(r.name.toLowerCase()))
    .slice(0, count);

  if (!mapped.length) {
    throw new Error("No recipes returned. Try again.");
  }

  return mapped;
}
