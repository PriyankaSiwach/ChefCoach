import { httpError } from "./http-error.mjs";

function cookTimeMinutesCap(maxCookTime) {
  if (maxCookTime === "15") return 15;
  if (maxCookTime === "30") return 30;
  if (maxCookTime === "60") return 60;
  return null;
}

/**
 * Validate and normalize POST /api/cook-recipes body.
 * Throws httpError(400) when required fields are missing.
 */
export function parseCookRecipesBody(body = {}) {
  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients
        .filter((x) => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.trim().slice(0, 80))
        .slice(0, 30)
    : [];

  if (ingredients.length === 0) {
    throw httpError(400, "At least one ingredient is required.");
  }

  const dietaryPreference =
    typeof body.dietaryPreference === "string" && body.dietaryPreference.trim()
      ? body.dietaryPreference.trim()
      : "None";
  const maxCookTime =
    typeof body.maxCookTime === "string" && ["any", "15", "30", "60"].includes(body.maxCookTime)
      ? body.maxCookTime
      : "any";

  const goal =
    typeof body.goal === "string" && body.goal.trim() ? body.goal.trim() : "maintain_weight";
  const allergies = Array.isArray(body.allergies)
    ? body.allergies.filter((x) => typeof x === "string" && x.trim())
    : [];
  const dislikedFoods = Array.isArray(body.dislikedFoods)
    ? body.dislikedFoods.filter((x) => typeof x === "string" && x.trim())
    : [];
  const dietaryRestrictionsPrompt =
    typeof body.dietaryRestrictionsPrompt === "string"
      ? body.dietaryRestrictionsPrompt.trim()
      : "";

  const cap = cookTimeMinutesCap(maxCookTime);
  const timeRule =
    cap == null ? "No strict time limit." : `Active cook + prep must fit within about ${cap} minutes total.`;

  const restrictionLine =
    dietaryRestrictionsPrompt ||
    (() => {
      const parts = [];
      if (dietaryPreference !== "None") {
        parts.push(`User is ${dietaryPreference.toLowerCase()}`);
      }
      if (allergies.length) {
        parts.push(`allergic to ${allergies.join(", ").toLowerCase()}`);
      }
      if (dislikedFoods.length) {
        parts.push(`dislikes ${dislikedFoods.join(", ").toLowerCase()}`);
      }
      if (!parts.length) return "No specific dietary restrictions listed.";
      return `${parts.join(", ")} — never include these in any recipe suggestions.`;
    })();

  const dietRules = [];
  if (dietaryPreference === "Halal") {
    dietRules.push("No pork, bacon, ham, or alcohol in any recipe or step.");
  }
  if (dietaryPreference === "Pescatarian") {
    dietRules.push("No meat or poultry; fish and seafood are allowed.");
  }

  const count =
    typeof body.count === "number" && Number.isFinite(body.count)
      ? Math.min(6, Math.max(1, Math.round(body.count)))
      : 4;
  const excludeTitles = Array.isArray(body.excludeTitles)
    ? body.excludeTitles.filter((x) => typeof x === "string" && x.trim()).map((s) => s.trim())
    : [];

  return {
    ingredients,
    dietaryPreference,
    maxCookTime,
    goal,
    allergies,
    dislikedFoods,
    dietaryRestrictionsPrompt,
    timeRule,
    restrictionLine,
    dietRules,
    count,
    excludeTitles,
  };
}

/**
 * Parse model text into a recipes array.
 * Strips markdown fences. Throws 502 on invalid JSON or empty recipes.
 */
export function parseRecipesFromModelContent(raw) {
  let text = typeof raw === "string" ? raw : "";
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw httpError(502, "Could not parse recipe response.");
  }

  const recipes = parsed && Array.isArray(parsed.recipes) ? parsed.recipes : [];
  if (recipes.length === 0) {
    throw httpError(502, "No recipes in response.");
  }
  return recipes;
}
