import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, isNativePlatform } = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: "user-token" } } })),
  isNativePlatform: vi.fn(() => false),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));

import { fetchCookRecipesFromApi } from "./cook-recipes-api";
import { FreeScansUsedError } from "./freeScansError";

const fetchMock = vi.fn();
const params = {
  ingredients: ["eggs", "spinach", "tomato"],
  dietaryPreference: "None" as const,
  maxCookTime: "any" as const,
  profile: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // A key left in the environment must not re-enable a direct OpenAI call.
  vi.stubEnv("VITE_OPENAI_API_KEY", "sk-should-never-be-used");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  isNativePlatform.mockReturnValue(false);
});

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

describe("fetchCookRecipesFromApi without a client OpenAI path", () => {
  it.each([
    ["backend down", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["503 daily cap", () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "busy" }), { status: 503 }))],
    ["401", () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "auth" }), { status: 401 }))],
    ["429", () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "slow" }), { status: 429 }))],
  ])("%s → built-in library, never api.openai.com", async (_label, arrange) => {
    arrange();
    const recipes = await fetchCookRecipesFromApi(params);
    expect(recipes.length).toBeGreaterThan(0);
    expect(calledUrls()).toEqual(["/api/cook-recipes"]);
  });

  it("402 free scans used → FreeScansUsedError('cook'), with no built-in library fallback", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "You've used your 3 free Cook scans.", code: "free_scans_used" }), {
        status: 402,
      })
    );
    const err = await fetchCookRecipesFromApi(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FreeScansUsedError);
    expect((err as FreeScansUsedError).kind).toBe("cook");
    expect((err as FreeScansUsedError).message).toBe("You've used your 3 free Cook scans.");
  });

  it("native build with no VITE_API_BASE_URL goes straight to the built-in library", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_BASE_URL", "");
    const recipes = await fetchCookRecipesFromApi(params);
    expect(recipes.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
