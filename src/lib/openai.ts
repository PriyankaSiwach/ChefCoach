import type {
  DietFilter,
  TimeFilter,
  UserProfile,
} from "@/types";
import { profilePromptExtras } from "@/lib/profile-prompt";

/** Vision-only: detect ingredient strings from a fridge photo. No recipe generation. */
export async function detectFridgeIngredients(
  imageBase64: string,
  mimeType: string,
  profile?: UserProfile | null
): Promise<string[]> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing OpenAI key. Set VITE_OPENAI_API_KEY in .env.local.");
  }

  const profileNote = profile
    ? ` User dietary preference: ${profile.dietaryPreference}. Flagged allergies (also avoid suggesting these as detected items when obvious): ${profile.allergies.filter((a) => a !== "None").join(", ") || "none"}.${profilePromptExtras(profile)}`
    : "";

  const prompt = `You analyze fridge / pantry photos. Respond with ONLY valid JSON (no markdown):
{"ingredients":["item1","item2","item3"]}

Rules:
- List 4–14 distinct food ingredients you can clearly see or reasonably infer (produce, proteins, dairy, grains, etc.).
- Use short lowercase names: "chicken breast", "eggs", "spinach", "tomatoes".
- Do NOT include recipes, steps, or quantities-only lines.
- Do NOT invent items you cannot see.${profileNote}

Return ONLY the JSON object.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(err.error?.message ?? "API error. Check key and try again.");
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
  return out.length ? out : [];
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
