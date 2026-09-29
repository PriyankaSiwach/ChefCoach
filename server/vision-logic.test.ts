import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDailyCap } from "./daily-cap.mjs";
import {
  parseFoodNutrition,
  parseFridgeIngredients,
  runFoodVision,
  runFridgeVision,
} from "./vision-logic.mjs";
import { jpegBase64 } from "./test-images";
import { jsonResponse, mockFetch, openAiReply } from "./test-fetch";

const body = { imageBase64: jpegBase64(), mimeType: "image/jpeg" };

describe("vision logic", () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  it("fridge scan sends the image to OpenAI and returns normalized ingredients", async () => {
    const fetchImpl = mockFetch(async () =>
      openAiReply({ ingredients: ["  Eggs ", "spinach", "eggs", 42, ""] })
    );
    const out = await runFridgeVision(body, { fetchImpl, dailyCap: createDailyCap({ max: 5 }) });

    expect(out).toEqual({ ingredients: ["eggs", "spinach"] });
    const sent = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(sent.messages[0].content[1].image_url.url).toBe(`data:image/jpeg;base64,${body.imageBase64}`);
    expect(sent.messages[0].content[1].image_url.detail).toBe("low");
  });

  it("food scan returns nutrition with numeric defaults", async () => {
    const fetchImpl = mockFetch(async () =>
      openAiReply({ name: "Salad", calories: "210.6", protein_g: -3, confidence: "high" })
    );
    const out = await runFoodVision(body, { fetchImpl, dailyCap: createDailyCap({ max: 5 }) });

    expect(out).toMatchObject({
      name: "Salad",
      servingDescription: "1 serving",
      calories: 211,
      protein_g: 0,
      confidence: "high",
    });
  });

  it("does not call OpenAI when the daily cap is spent", async () => {
    const fetchImpl = vi.fn();
    const cap = createDailyCap({ max: 1 });
    cap.tryConsume();

    await expect(runFridgeVision(body, { fetchImpl, dailyCap: cap })).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not consume the cap for invalid images", async () => {
    const cap = createDailyCap({ max: 5 });
    await expect(
      runFridgeVision({ imageBase64: "nope" }, { fetchImpl: vi.fn(), dailyCap: cap })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(cap.used).toBe(0);
  });

  it("maps OpenAI failures to a generic 502 that does not echo the request", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ error: { message: `bad image ${body.imageBase64}` } }, 400)
    );
    const err = await runFoodVision(body, { fetchImpl, dailyCap: createDailyCap({ max: 5 }) }).catch(
      (e) => e
    );
    expect(err.statusCode).toBe(502);
    expect(err.message).not.toContain(body.imageBase64);
  });

  it("maps network errors and timeouts to 502", async () => {
    const fetchImpl = mockFetch(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(
      runFridgeVision(body, { fetchImpl, dailyCap: createDailyCap({ max: 5 }) })
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("returns 500 when the server has no OpenAI key", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(runFridgeVision(body, { fetchImpl: vi.fn() })).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

describe("vision response parsing", () => {
  it("rejects unparseable model output with 502", () => {
    expect(() => parseFridgeIngredients("not json")).toThrow();
    expect(() => parseFoodNutrition("not json")).toThrow();
  });

  it("strips markdown fences", () => {
    expect(parseFridgeIngredients('```json\n{"ingredients":["milk"]}\n```')).toEqual({
      ingredients: ["milk"],
    });
  });
});
