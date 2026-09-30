/**
 * Photo scans go through the ChefCoach server (POST /api/vision/*), which holds
 * the OpenAI key. The app never calls OpenAI directly.
 */
import type { UserProfile } from "@/types";
import { apiUrl, BackendNotConfiguredError, BACKEND_NOT_CONFIGURED_MESSAGE } from "@/lib/apiBase";
import { supabase } from "@/lib/supabaseClient";
import { compressImageDataUrl } from "@/lib/compressImageDataUrl";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { freeScansUsedFrom } from "@/lib/freeScansError";
import { profilePromptExtras } from "@/lib/profile-prompt";
import type { FoodScanConfidence, FoodScanResult } from "@/lib/foodTracker";

/** Server-side OpenAI timeout is 45s; leave headroom for upload and response. */
const VISION_TIMEOUT_MS = 55_000;

export type VisionErrorKind =
  | "backend_not_configured"
  | "unreachable"
  | "rate_limited"
  | "busy"
  | "unauthorized"
  | "bad_image"
  | "no_ingredients";

type ScanKind = "fridge" | "food";

const UNREACHABLE_MESSAGE: Record<ScanKind, string> = {
  fridge: "Couldn't scan your photo. Check your connection or type ingredients instead.",
  food: "Couldn't analyze your photo. Check your connection and try again.",
};

export const VISION_MESSAGES = {
  rate_limited: "Too many requests, try again shortly.",
  busy: "ChefCoach is busy right now, try again later.",
  unauthorized: "Sign-in required to scan. Check your connection.",
  no_ingredients:
    "We couldn't spot any ingredients in that photo. Try a clearer photo or type ingredients instead.",
  bad_image: "We couldn't use that photo. Try a different image.",
} as const;

export class VisionScanError extends Error {
  readonly kind: VisionErrorKind;
  readonly status: number | null;

  constructor(kind: VisionErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "VisionScanError";
    this.kind = kind;
    this.status = status;
  }
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function readServerError(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: unknown };
    return typeof data.error === "string" && data.error.trim() ? data.error : null;
  } catch {
    return null;
  }
}

async function toVisionError(res: Response, scan: ScanKind): Promise<VisionScanError> {
  const { status } = res;
  if (status === 429) return new VisionScanError("rate_limited", VISION_MESSAGES.rate_limited, status);
  if (status === 503) return new VisionScanError("busy", VISION_MESSAGES.busy, status);
  if (status === 401 || status === 403) {
    return new VisionScanError("unauthorized", VISION_MESSAGES.unauthorized, status);
  }
  if (status === 400 || status === 413) {
    // Server validation messages are generic and never echo image data.
    const message = (await readServerError(res)) ?? VISION_MESSAGES.bad_image;
    return new VisionScanError("bad_image", message, status);
  }
  return new VisionScanError("unreachable", UNREACHABLE_MESSAGE[scan], status);
}

async function compressForUpload(dataUrl: string): Promise<{ imageBase64: string; mimeType: string }> {
  try {
    const { base64, mimeType } = await compressImageDataUrl(dataUrl);
    return { imageBase64: base64, mimeType };
  } catch {
    return {
      imageBase64: dataUrl.split(",")[1] ?? "",
      mimeType: dataUrl.split(";")[0]?.split(":")[1] || "image/jpeg",
    };
  }
}

async function postVision(
  scan: ScanKind,
  body: { imageBase64: string; mimeType: string; profileNote?: string }
): Promise<unknown> {
  let url: string;
  try {
    url = apiUrl(`/api/vision/${scan}`);
  } catch (e) {
    if (e instanceof BackendNotConfiguredError) {
      throw new VisionScanError("backend_not_configured", BACKEND_NOT_CONFIGURED_MESSAGE);
    }
    throw e;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeoutMs: VISION_TIMEOUT_MS,
    });
  } catch {
    throw new VisionScanError("unreachable", UNREACHABLE_MESSAGE[scan]);
  }

  if (res.status === 402) throw await freeScansUsedFrom(res, scan === "fridge" ? "cook" : "track");
  if (!res.ok) throw await toVisionError(res, scan);

  try {
    return await res.json();
  } catch {
    throw new VisionScanError("unreachable", UNREACHABLE_MESSAGE[scan], res.status);
  }
}

/**
 * Fridge photo → ingredient names. Throws VisionScanError, or FreeScansUsedError when the
 * server says the free Cook scans are used; never returns placeholder ingredients.
 */
export async function scanFridgeIngredients(
  dataUrl: string,
  profile?: UserProfile | null
): Promise<string[]> {
  const image = await compressForUpload(dataUrl);
  const profileNote = profile ? profilePromptExtras(profile) : "";
  const data = (await postVision("fridge", { ...image, profileNote })) as { ingredients?: unknown };

  const ingredients = (Array.isArray(data.ingredients) ? data.ingredients : [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim().toLowerCase());

  if (!ingredients.length) {
    throw new VisionScanError("no_ingredients", VISION_MESSAGES.no_ingredients);
  }
  return ingredients;
}

const CONFIDENCE: FoodScanConfidence[] = ["high", "medium", "low"];

/** Meal photo → nutrition estimate. Throws VisionScanError, or FreeScansUsedError (free Track scans used). */
export async function scanFoodNutrition(dataUrl: string): Promise<FoodScanResult> {
  const image = await compressForUpload(dataUrl);
  const d = (await postVision("food", image)) as Partial<Record<keyof FoodScanResult, unknown>>;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const text = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

  return {
    name: text(d.name, "Unknown food"),
    servingDescription: text(d.servingDescription, "1 serving"),
    calories: num(d.calories),
    protein_g: num(d.protein_g),
    carbs_g: num(d.carbs_g),
    fat_g: num(d.fat_g),
    fiber_g: num(d.fiber_g),
    sugar_g: num(d.sugar_g),
    sodium_mg: num(d.sodium_mg),
    confidence: CONFIDENCE.includes(d.confidence as FoodScanConfidence)
      ? (d.confidence as FoodScanConfidence)
      : "medium",
    healthNote: typeof d.healthNote === "string" ? d.healthNote : "",
  };
}
