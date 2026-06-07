/**
 * Shared cook-recipes generation (OpenAI). Used by Express (production/API server)
 * and Vite dev middleware so /api/cook-recipes works even if API server is stale or not restarted.
 */

function cookTimeMinutesCap(maxCookTime) {
  if (maxCookTime === "15") return 15;
  if (maxCookTime === "30") return 30;
  if (maxCookTime === "60") return 60;
  return null;
}

function httpError(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ recipes: unknown[] }>}
 */
export async function runCookRecipes(body) {
  const openAiKey =
    process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "";

  if (!openAiKey) {
    throw httpError(500, "OpenAI is not configured (OPENAI_API_KEY).");
  }

  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients
        .filter((x) => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.trim())
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

  const excludeRule =
    excludeTitles.length > 0
      ? `- Do NOT reuse these titles (already suggested): ${JSON.stringify(excludeTitles)}`
      : "";

  const prompt = `You suggest practical home recipes. Output ONLY valid JSON (no markdown).

Schema:
{"recipes":[{"title":"string","description":"string (2-4 sentences)","cookTime":"string like \\"25 mins\\"","difficulty":"Easy"|"Medium"|"Hard","matchedIngredients":["strings from user list actually used"],"missingOptionalIngredients":["extras that would help but aren't required"],"calories":number,"protein":number,"carbs":number,"fat":number,"allergyWarning":"string; empty string if none","goalReason":"one sentence why this fits the user's goal","steps":["4-7 short imperative cooking steps"]}]}

Rules:
- Return exactly ${count} recipes in "recipes".
- Each recipe must primarily use ingredients from the user's list; matchedIngredients must be a subset of those ingredient strings (case-insensitive OK but copy wording from list when possible).
- Respect dietary preference: ${dietaryPreference}.
${dietRules.length ? `- ${dietRules.join("\n- ")}` : ""}
- ${timeRule}
- User goal: ${goal}. Tailor goalReason (e.g. higher protein for build_muscle, lighter for lose_weight).
- Dietary restrictions: ${restrictionLine}
- Numbers for calories and macros should be realistic per serving for one main portion.
- Titles must be unique.
${excludeRule}

User ingredients (JSON array): ${JSON.stringify(ingredients)}`;

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: count <= 2 ? 1800 : 3200,
        temperature: 0.65,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    throw httpError(502, "Recipe generation failed. Try again.");
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || "OpenAI request failed.";
    throw httpError(502, msg);
  }

  const data = await response.json();
  let raw = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw httpError(502, "Could not parse recipe response.");
  }

  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  if (recipes.length === 0) {
    throw httpError(502, "No recipes in response.");
  }

  return { recipes };
}
