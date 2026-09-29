/**
 * Food Tracker — snap a photo of any (ready-made) food and get instant
 * nutrition estimates (via the ChefCoach server, see vision-api.ts), then
 * optionally save to on-device history.
 */
import { compressImageDataUrl } from "@/lib/compressImageDataUrl";

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
    const list = parsed.filter(
      (x): x is FoodScanHistoryEntry =>
        x != null && typeof x === "object" && typeof (x as FoodScanHistoryEntry).id === "string"
    );
    // Deduplicate by id (guards against older double-save bug)
    const seen = new Set<string>();
    return list.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
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
