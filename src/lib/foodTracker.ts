/**
 * Food Tracker — snap a photo of any (ready-made) food and get instant
 * nutrition estimates via OpenAI vision, then optionally save to history.
 */
import { Capacitor } from "@capacitor/core";
import { compressImageDataUrl } from "@/lib/compressImageDataUrl";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export type FoodScanConfidence = "high" | "medium" | "low";

export type FoodScanResult = {
  name: string;
  servingDescription: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  confidence: FoodScanConfidence;
  healthNote: string;
};

export type FoodScanHistoryEntry = FoodScanResult & {
  id: string;
  scannedAt: string;
  /** Small compressed thumbnail — kept short to stay within localStorage limits. */
  thumbnailDataUri: string;
};

const HISTORY_KEY = "chefcoach_food_tracker_history";
const MAX_HISTORY_ENTRIES = 40;

function newScanId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Downscale aggressively — this is a list-thumbnail, not a full photo. */
export async function makeFoodScanThumbnail(dataUrl: string): Promise<string> {
  try {
    const { base64, mimeType } = await compressImageDataUrl(dataUrl, 260, 0.55);
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return dataUrl;
  }
}

export function readFoodScanHistory(): FoodScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is FoodScanHistoryEntry =>
        x != null && typeof x === "object" && typeof (x as FoodScanHistoryEntry).id === "string"
    );
  } catch {
    return [];
  }
}

function writeFoodScanHistory(entries: FoodScanHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
    window.dispatchEvent(new CustomEvent("chefcoach-food-tracker-changed"));
  } catch {
    // Storage quota exceeded — drop oldest half and retry once.
    try {
      const trimmed = entries.slice(0, Math.max(5, Math.floor(entries.length / 2)));
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      window.dispatchEvent(new CustomEvent("chefcoach-food-tracker-changed"));
    } catch {
      /* give up silently — history is a convenience feature */
    }
  }
}

export function saveFoodScanToHistory(
  result: FoodScanResult,
  thumbnailDataUri: string
): FoodScanHistoryEntry {
  const entry: FoodScanHistoryEntry = {
    ...result,
    id: newScanId(),
    scannedAt: new Date().toISOString(),
    thumbnailDataUri,
  };
  const next = [entry, ...readFoodScanHistory()];
  writeFoodScanHistory(next);
  return entry;
}

export function removeFoodScanFromHistory(id: string): void {
  const next = readFoodScanHistory().filter((e) => e.id !== id);
  writeFoodScanHistory(next);
}

function parseFoodScanJson(raw: string): FoodScanResult {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  const confidence: FoodScanConfidence =
    parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
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
 * Vision-only: estimate nutrition for a single photo of prepared/ready-made food.
 * Throws a user-facing Error message on failure (network, parsing, missing key).
 */
export async function detectFoodNutrition(dataUrl: string): Promise<FoodScanResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing OpenAI key. Set VITE_OPENAI_API_KEY in .env.local.");
  }

  const isNative = Capacitor.isNativePlatform();
  const timeoutMs = isNative ? 40_000 : 60_000;

  let compressed: { base64: string; mimeType: string };
  try {
    compressed = await compressImageDataUrl(dataUrl);
  } catch {
    compressed = {
      base64: dataUrl.split(",")[1] ?? "",
      mimeType: dataUrl.split(";")[0]?.split(":")[1] || "image/jpeg",
    };
  }

  const prompt = `You are a nutrition estimation assistant analyzing a photo of a single plate/serving of food (home-cooked, restaurant, or packaged). Respond with ONLY valid JSON (no markdown):
{"name":"string (concise dish name)","servingDescription":"string like \\"1 bowl (~350g)\\" or \\"1 serving\\"","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number,"sugar_g":number,"sodium_mg":number,"confidence":"high"|"medium"|"low","healthNote":"one short factual sentence, under 18 words"}

Rules:
- Estimate realistic nutrition values for the single visible serving, using typical recipes and standard nutrition-database references (USDA-style).
- If multiple foods are visible on one plate, estimate combined totals and name it accordingly (e.g. "Chicken, rice & broccoli plate").
- Always return a best-effort numeric estimate — never leave a field at 0 unless it is genuinely negligible for that food.
- If the photo is unclear or not food, still provide your best guess and set confidence to "low".
- Return ONLY the JSON object, no extra text.`;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 500,
      temperature: 0.4,
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
                detail: "auto",
              },
            },
          ],
        },
      ],
    }),
    timeoutMs,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? "Could not analyze this photo. Try again.");
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    throw new Error("No response from AI. Try again.");
  }

  try {
    return parseFoodScanJson(raw);
  } catch {
    throw new Error("Could not read the nutrition results. Try again.");
  }
}
