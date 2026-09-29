/**
 * Shared cook-recipes generation (OpenAI). Used by Express (production/API server)
 * and Vite dev middleware so /api/cook-recipes works even if API server is stale or not restarted.
 *
 * LRU cache wraps the OpenAI call only — auth and body validation stay unchanged.
 */

import { httpError } from "./http-error.mjs";
import { createLruCache } from "./lru-cache.mjs";
import { consumeDailyCapOrThrow, getOpenAiDailyCap } from "./daily-cap.mjs";
import {
  parseCookRecipesBody,
  parseRecipesFromModelContent,
} from "./cook-recipes-validate.mjs";

let cookRecipesCache;

export function getCookRecipesCache() {
  if (!cookRecipesCache) {
    const capacity = Number(process.env.COOK_RECIPES_CACHE_CAPACITY) || 100;
    cookRecipesCache = createLruCache(capacity);
  }
  return cookRecipesCache;
}

/** Stable cache key from validated request fields that affect the model prompt. */
export function cookRecipesCacheKey(parsed) {
  const norm = (arr) =>
    [...arr].map((s) => String(s).trim().toLowerCase()).sort();

  return JSON.stringify({
    ingredients: norm(parsed.ingredients),
    dietaryPreference: parsed.dietaryPreference,
    maxCookTime: parsed.maxCookTime,
    goal: parsed.goal,
    allergies: norm(parsed.allergies),
    dislikedFoods: norm(parsed.dislikedFoods),
    dietaryRestrictionsPrompt: parsed.dietaryRestrictionsPrompt,
    count: parsed.count,
    excludeTitles: norm(parsed.excludeTitles),
  });
}

function cloneResult(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** OpenAI call only — no cache. */
async function generateCookRecipesFromOpenAI(parsed, { openAiKey, fetchImpl }) {
  const {
    ingredients,
    dietaryPreference,
    goal,
    timeRule,
    restrictionLine,
    dietRules,
    count,
    excludeTitles,
  } = parsed;

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
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
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
  const raw = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  const recipes = parseRecipesFromModelContent(raw);
  return { recipes };
}

/**
 * Validate → LRU cache → daily cap → OpenAI on miss. Cache hits do not count toward the cap.
 * @param {Record<string, unknown>} body
 * @param {{
 *   cache?: ReturnType<typeof createLruCache>,
 *   fetchImpl?: typeof fetch,
 *   dailyCap?: { tryConsume: () => { allowed: boolean, retryAfterMs: number } },
 * }} [deps]
 * @returns {Promise<{ recipes: unknown[] }>}
 */
export async function runCookRecipes(body, deps = {}) {
  const openAiKey = process.env.OPENAI_API_KEY || "";

  if (!openAiKey) {
    throw httpError(500, "OpenAI is not configured (OPENAI_API_KEY).");
  }

  const parsed = parseCookRecipesBody(body ?? {});
  const cache = deps.cache ?? getCookRecipesCache();
  const key = cookRecipesCacheKey(parsed);

  const cached = cache.get(key);
  if (cached) {
    return cloneResult(cached);
  }

  consumeDailyCapOrThrow(deps.dailyCap ?? getOpenAiDailyCap());

  const result = await generateCookRecipesFromOpenAI(parsed, {
    openAiKey,
    fetchImpl: deps.fetchImpl ?? globalThis.fetch,
  });
  cache.set(key, cloneResult(result));
  return result;
}
