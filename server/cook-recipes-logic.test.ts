import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLruCache } from "./lru-cache.mjs";
import { runCookRecipes } from "./cook-recipes-logic.mjs";
import { mockFetch, openAiReply } from "./test-fetch";

function recipe(title: string) {
  return {
    title,
    description: `${title} description.`,
    cookTime: "15 mins",
    difficulty: "Easy",
    matchedIngredients: ["eggs"],
    missingOptionalIngredients: [],
    calories: 100,
    protein: 10,
    carbs: 5,
    fat: 4,
    allergyWarning: "",
    goalReason: "Simple.",
    steps: ["Cook"],
  };
}

function openAiResponse(recipes: unknown[]) {
  return openAiReply({ recipes });
}

describe("recipe generation LRU wrap", () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  it("cache hits skip the OpenAI call", async () => {
    const cache = createLruCache(10);
    const fetchImpl = mockFetch(async () => openAiResponse([recipe("Scramble")]));

    const first = await runCookRecipes(
      { ingredients: ["eggs", "spinach"] },
      { cache, fetchImpl }
    );
    const second = await runCookRecipes(
      { ingredients: ["spinach", "eggs"] },
      { cache, fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("cache misses store new results and evict the oldest entry once full", async () => {
    const cache = createLruCache(2);
    const fetchImpl = mockFetch(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const prompt = body.messages[0].content;
      const title = prompt.includes("tomato")
        ? "Tomato"
        : prompt.includes("onion")
          ? "Onion"
          : "Eggs";
      return openAiResponse([recipe(title)]);
    });

    await runCookRecipes({ ingredients: ["eggs"] }, { cache, fetchImpl });
    await runCookRecipes({ ingredients: ["tomato"] }, { cache, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);

    // Third distinct input fills past capacity → evicts the oldest (eggs) entry.
    await runCookRecipes({ ingredients: ["onion"] }, { cache, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(cache.size).toBe(2);

    // Eggs was evicted → miss → OpenAI called again (and tomato becomes LRU).
    await runCookRecipes({ ingredients: ["eggs"] }, { cache, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    // Onion remains cached → hit → no extra OpenAI call.
    await runCookRecipes({ ingredients: ["onion"] }, { cache, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
