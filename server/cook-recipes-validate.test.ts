import { describe, expect, it } from "vitest";
import {
  parseCookRecipesBody,
  parseRecipesFromModelContent,
} from "./cook-recipes-validate.mjs";

describe("parseCookRecipesBody", () => {
  it("rejects empty or non-string ingredients with 400", () => {
    expect(() => parseCookRecipesBody({})).toThrow(/ingredient/i);
    try {
      parseCookRecipesBody({ ingredients: ["", "  ", 1] });
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  it("clamps recipe count to 1–6 and defaults cook time", () => {
    const parsed = parseCookRecipesBody({
      ingredients: [" eggs ", "tomato"],
      count: 99,
      maxCookTime: "yesterday",
    });
    expect(parsed.ingredients).toEqual(["eggs", "tomato"]);
    expect(parsed.count).toBe(6);
    expect(parsed.maxCookTime).toBe("any");
  });

  it("caps ingredient count and length to bound prompt size", () => {
    const parsed = parseCookRecipesBody({
      ingredients: Array.from({ length: 40 }, (_, i) => `${"x".repeat(100)}${i}`),
    });
    expect(parsed.ingredients).toHaveLength(30);
    expect(parsed.ingredients.every((s: string) => s.length <= 80)).toBe(true);
  });
});

describe("parseRecipesFromModelContent", () => {
  it("parses JSON even when wrapped in markdown fences", () => {
    const recipes = parseRecipesFromModelContent(
      '```json\n{"recipes":[{"title":"Omelette"}]}\n```'
    );
    expect(recipes).toEqual([{ title: "Omelette" }]);
  });

  it("throws 502 on malformed JSON", () => {
    try {
      parseRecipesFromModelContent("not json");
      expect.unreachable();
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(502);
    }
  });

  it("throws 502 when recipes array is missing or empty", () => {
    try {
      parseRecipesFromModelContent('{"recipes":[]}');
      expect.unreachable();
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(502);
    }
  });
});
