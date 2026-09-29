import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, isNativePlatform } = vi.hoisted(() => ({
  getSession: vi.fn(),
  isNativePlatform: vi.fn(() => false),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));
vi.mock("@/lib/compressImageDataUrl", () => ({
  compressImageDataUrl: vi.fn(async () => ({ base64: "/9j/4AAQ", mimeType: "image/jpeg" })),
}));

import { scanFoodNutrition, scanFridgeIngredients, VisionScanError, VISION_MESSAGES } from "./vision-api";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function scanError(p: Promise<unknown>): Promise<VisionScanError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VisionScanError);
    return e as VisionScanError;
  }
  throw new Error("expected the scan to fail");
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: "user-token" } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  getSession.mockReset();
  isNativePlatform.mockReturnValue(false);
});

describe("scanFridgeIngredients", () => {
  it("POSTs to /api/vision/fridge with the Supabase token and never to OpenAI", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ingredients: [" Eggs ", "spinach", 3, ""] }));

    await expect(scanFridgeIngredients(PHOTO, null)).resolves.toEqual(["eggs", "spinach"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/vision/fridge");
    expect(url).not.toContain("openai");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-token");
    expect(JSON.parse(init.body as string)).toMatchObject({
      imageBase64: "/9j/4AAQ",
      mimeType: "image/jpeg",
    });
  });

  it("sends no Authorization header when there is no session (server answers 401)", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Sign in required." }));

    const err = await scanError(scanFridgeIngredients(PHOTO, null));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(err.kind).toBe("unauthorized");
    expect(err.message).toBe(VISION_MESSAGES.unauthorized);
  });

  it("does not substitute placeholder ingredients for an empty result", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ingredients: [] }));
    const err = await scanError(scanFridgeIngredients(PHOTO, null));
    expect(err.kind).toBe("no_ingredients");
  });

  it.each([
    [429, "rate_limited", VISION_MESSAGES.rate_limited],
    [503, "busy", VISION_MESSAGES.busy],
    [401, "unauthorized", VISION_MESSAGES.unauthorized],
    [500, "unreachable", "Couldn't scan your photo. Check your connection or type ingredients instead."],
    [502, "unreachable", "Couldn't scan your photo. Check your connection or type ingredients instead."],
  ])("maps HTTP %i to %s", async (status, kind, message) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: "internal detail" }));
    const err = await scanError(scanFridgeIngredients(PHOTO, null));
    expect(err.kind).toBe(kind);
    expect(err.message).toBe(message);
    expect(err.status).toBe(status);
  });

  it("shows the server's validation message for a rejected image", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "Unsupported image type. Use JPEG, PNG, or WebP." }));
    const err = await scanError(scanFridgeIngredients(PHOTO, null));
    expect(err.kind).toBe("bad_image");
    expect(err.message).toBe("Unsupported image type. Use JPEG, PNG, or WebP.");
  });

  it("maps a network failure (backend down) to the unreachable message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await scanError(scanFridgeIngredients(PHOTO, null));
    expect(err.kind).toBe("unreachable");
    expect(err.status).toBeNull();
  });

  it("fails with 'backend not configured' on native without VITE_API_BASE_URL, without any request", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_BASE_URL", "");
    const err = await scanError(scanFridgeIngredients(PHOTO, null));
    expect(err.kind).toBe("backend_not_configured");
    expect(err.message).toMatch(/backend not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the deployed API origin on native", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    fetchMock.mockResolvedValue(jsonResponse(200, { ingredients: ["eggs"] }));
    await scanFridgeIngredients(PHOTO, null);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/vision/fridge");
  });
});

describe("scanFoodNutrition", () => {
  it("POSTs to /api/vision/food with the token and returns the estimate", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        name: "Salad",
        servingDescription: "1 bowl",
        calories: 210,
        protein_g: 8,
        carbs_g: 20,
        fat_g: 11,
        fiber_g: 5,
        sugar_g: 4,
        sodium_mg: 300,
        confidence: "high",
        healthNote: "Fresh greens.",
      })
    );

    const result = await scanFoodNutrition(PHOTO);
    expect(result).toMatchObject({ name: "Salad", calories: 210, confidence: "high" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/vision/food");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-token");
  });

  it("uses the food-specific message when the backend is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await scanError(scanFoodNutrition(PHOTO));
    expect(err.message).toBe("Couldn't analyze your photo. Check your connection and try again.");
  });

  it("maps 503 (daily cap) to the busy message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: "ChefCoach is busy right now, try again later." }));
    const err = await scanError(scanFoodNutrition(PHOTO));
    expect(err.kind).toBe("busy");
  });
});
