import { describe, expect, it } from "vitest";
import { mapCookRecipeToResultItem } from "@/lib/cook-recipe-mapper";

describe("mapCookRecipeToResultItem", () => {
  it("returns null when title is missing (malformed model output)", () => {
    expect(mapCookRecipeToResultItem({ description: "no title" }, "None")).toBeNull();
    expect(mapCookRecipeToResultItem({ title: "   " }, "None")).toBeNull();
    expect(mapCookRecipeToResultItem({ title: 123 }, "None")).toBeNull();
  });

  it("maps a valid recipe and coerces numeric strings", () => {
    const item = mapCookRecipeToResultItem(
      {
        title: "Veggie Stir Fry",
        description: "Quick wok vegetables.",
        cookTime: "20 mins",
        difficulty: "medium",
        calories: "410.4",
        protein: "18",
        carbs: "40",
        fat: "12",
        matchedIngredients: ["broccoli", "garlic", ""],
        missingOptionalIngredients: "not-an-array",
        steps: ["Heat the pan until hot.", "Add vegetables and toss.", "Serve immediately."],
      },
      "Vegetarian"
    );

    expect(item).not.toBeNull();
    expect(item?.name).toBe("Veggie Stir Fry");
    expect(item?.diet).toBe("Vegetarian");
    expect(item?.difficulty).toBe("Medium");
    expect(item?.calories).toBe(410);
    expect(item?.protein_g).toBe(18);
    expect(item?.ingredientsUsed).toEqual(["broccoli", "garlic"]);
    expect(item?.missingOptionalIngredients).toEqual([]);
    expect(item?.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("fills defaults when macros and cookTime are missing", () => {
    const item = mapCookRecipeToResultItem({ title: "Soup" }, "None");
    expect(item?.cookTime).toBe("30 mins");
    expect(item?.diet).toBe("Balanced");
    expect(item?.calories).toBe(350);
    expect(item?.steps.length).toBeGreaterThanOrEqual(3);
  });
});
