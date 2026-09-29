/**
 * Server-side OpenAI vision for fridge scans and food (nutrition) scans.
 * Photos are forwarded to OpenAI and discarded: never stored, cached, or logged.
 */

import { httpError } from "./http-error.mjs";
import { consumeDailyCapOrThrow, getOpenAiDailyCap } from "./daily-cap.mjs";
import { parseVisionImageBody } from "./vision-validate.mjs";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const VISION_TIMEOUT_MS = 45_000;
const MAX_INGREDIENTS = 20;
const MAX_INGREDIENT_CHARS = 80;

function fridgePrompt(profileNote) {
  return `You analyze fridge / pantry photos. Respond with ONLY valid JSON (no markdown):
{"ingredients":["item1","item2","item3"]}

Rules:
- List 4–14 distinct food ingredients you can clearly see or reasonably infer (produce, proteins, dairy, grains, etc.).
- Use short lowercase names: "chicken breast", "eggs", "spinach", "tomatoes".
- Do NOT include recipes, steps, or quantities-only lines.
- Do NOT invent items you cannot see.${profileNote ? `\n${profileNote}` : ""}

Return ONLY the JSON object.`;
}

const FOOD_PROMPT = `You are a nutrition estimation assistant analyzing a photo of a single plate/serving of food (home-cooked, restaurant, or packaged). Respond with ONLY valid JSON (no markdown):
{"name":"string (concise dish name)","servingDescription":"string like \\"1 bowl (~350g)\\" or \\"1 serving\\"","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number,"sugar_g":number,"sodium_mg":number,"confidence":"high"|"medium"|"low","healthNote":"one short factual sentence, under 18 words"}

Rules:
- Estimate realistic nutrition values for the single visible serving, using typical recipes and standard nutrition-database references (USDA-style).
- If multiple foods are visible on one plate, estimate combined totals and name it accordingly (e.g. "Chicken, rice & broccoli plate").
- Always return a best-effort numeric estimate — never leave a field at 0 unless it is genuinely negligible for that food.
- If the photo is unclear or not food, still provide your best guess and set confidence to "low".
- Return ONLY the JSON object, no extra text.`;

function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) throw httpError(500, "OpenAI is not configured (OPENAI_API_KEY).");
  return key;
}

function parseModelJson(raw) {
  const cleaned = String(raw ?? "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  return parsed;
}

/**
 * One vision call. Failure messages are generic so nothing from the request is echoed.
 * @param {{ prompt: string, image: { imageBase64: string, mimeType: string }, detail: string, temperature?: number, fetchImpl: typeof fetch, openAiKey: string }} args
 */
async function callVision({ prompt, image, detail, temperature, fetchImpl, openAiKey }) {
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        ...(temperature === undefined ? {} : { temperature }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${image.mimeType};base64,${image.imageBase64}`,
                  detail,
                },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });
  } catch {
    throw httpError(502, "Could not analyze this photo. Try again.");
  }

  if (!response.ok) {
    throw httpError(502, "Could not analyze this photo. Try again.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw httpError(502, "Could not read the scan results. Try again.");
  }
  const raw = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  if (!raw) throw httpError(502, "No response from AI. Try again.");
  return raw;
}

export function parseFridgeIngredients(raw) {
  let parsed;
  try {
    parsed = parseModelJson(raw);
  } catch {
    throw httpError(502, "Could not read the scan results. Try again.");
  }
  const list = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
  const seen = new Set();
  const ingredients = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const name = item.trim().toLowerCase().slice(0, MAX_INGREDIENT_CHARS);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    ingredients.push(name);
    if (ingredients.length >= MAX_INGREDIENTS) break;
  }
  return { ingredients };
}

export function parseFoodNutrition(raw) {
  let parsed;
  try {
    parsed = parseModelJson(raw);
  } catch {
    throw httpError(502, "Could not read the nutrition results. Try again.");
  }
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  const confidence = ["high", "medium", "low"].includes(parsed.confidence)
    ? parsed.confidence
    : "medium";

  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Unknown food",
    servingDescription:
      typeof parsed.servingDescription === "string" && parsed.servingDescription.trim()
        ? parsed.servingDescription.trim()
        : "1 serving",
    calories: num(parsed.calories),
    protein_g: num(parsed.protein_g),
    carbs_g: num(parsed.carbs_g),
    fat_g: num(parsed.fat_g),
    fiber_g: num(parsed.fiber_g),
    sugar_g: num(parsed.sugar_g),
    sodium_mg: num(parsed.sodium_mg),
    confidence,
    healthNote: typeof parsed.healthNote === "string" ? parsed.healthNote.trim().slice(0, 160) : "",
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ fetchImpl?: typeof fetch, dailyCap?: { tryConsume: () => { allowed: boolean, retryAfterMs: number } } }} [deps]
 * @returns {Promise<{ ingredients: string[] }>}
 */
export async function runFridgeVision(body, deps = {}) {
  const openAiKey = requireOpenAiKey();
  const image = parseVisionImageBody(body ?? {});
  consumeDailyCapOrThrow(deps.dailyCap ?? getOpenAiDailyCap());
  const raw = await callVision({
    prompt: fridgePrompt(image.profileNote),
    image,
    detail: "low",
    fetchImpl: deps.fetchImpl ?? globalThis.fetch,
    openAiKey,
  });
  return parseFridgeIngredients(raw);
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ fetchImpl?: typeof fetch, dailyCap?: { tryConsume: () => { allowed: boolean, retryAfterMs: number } } }} [deps]
 */
export async function runFoodVision(body, deps = {}) {
  const openAiKey = requireOpenAiKey();
  const image = parseVisionImageBody(body ?? {});
  consumeDailyCapOrThrow(deps.dailyCap ?? getOpenAiDailyCap());
  const raw = await callVision({
    prompt: FOOD_PROMPT,
    image,
    detail: "auto",
    temperature: 0.4,
    fetchImpl: deps.fetchImpl ?? globalThis.fetch,
    openAiKey,
  });
  return parseFoodNutrition(raw);
}
