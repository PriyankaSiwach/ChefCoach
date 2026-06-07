import type {
  DietFilter,
  TimeFilter,
  UserProfile,
} from "@/types";
import { Capacitor } from "@capacitor/core";
import { profilePromptExtras } from "@/lib/profile-prompt";
import { compressImageDataUrl } from "@/lib/compressImageDataUrl";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

/** Vision-only: detect ingredient strings from a fridge photo. Never throws — returns [] on failure. */
export async function detectFridgeIngredients(
  imageBase64: string,
  mimeType: string,
  profile?: UserProfile | null
): Promise<string[]> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
  const isNative = Capacitor.isNativePlatform();

  if (!apiKey) {
    return [];
  }

  const visionTimeoutMs = isNative ? 45_000 : 60_000;

  try {
    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    let compressed: { base64: string; mimeType: string };
    try {
      compressed = await compressImageDataUrl(dataUrl);
    } catch {
      compressed = {
        base64: imageBase64.startsWith("data:") ? (imageBase64.split(",")[1] ?? "") : imageBase64,
        mimeType,
      };
    }

    const profileNote = profile ? profilePromptExtras(profile) : "";

    const prompt = `You analyze fridge / pantry photos. Respond with ONLY valid JSON (no markdown):
{"ingredients":["item1","item2","item3"]}

Rules:
- List 4–14 distinct food ingredients you can clearly see or reasonably infer (produce, proteins, dairy, grains, etc.).
- Use short lowercase names: "chicken breast", "eggs", "spinach", "tomatoes".
- Do NOT include recipes, steps, or quantities-only lines.
- Do NOT invent items you cannot see.${profileNote}

Return ONLY the JSON object.`;

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${compressed.mimeType};base64,${compressed.base64}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
      }),
      timeoutMs: visionTimeoutMs,
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(raw) as { ingredients?: unknown };
    const arr = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
    const out = arr
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim().toLowerCase());

    return out;
  } catch {
    return [];
  }
}

/** @deprecated Use detectFridgeIngredients + local meal matching instead. */
export async function generateRecipes(
  imageBase64: string,
  mimeType: string,
  _diet: DietFilter,
  _time: TimeFilter,
  profile?: UserProfile | null
): Promise<{ ingredients: string[]; recipes: never[] }> {
  const ingredients = await detectFridgeIngredients(imageBase64, mimeType, profile);
  return { ingredients, recipes: [] };
}
