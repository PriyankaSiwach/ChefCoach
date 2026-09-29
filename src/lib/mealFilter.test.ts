import { describe, expect, it } from "vitest";
import { isSafeForUser, mealSatisfiesDietLabel } from "@/lib/mealFilter";
import { makeMeal, makeProfile } from "@/test/fixtures";

const chicken = makeMeal({
  name: "Chicken Bowl",
  description: "Grilled chicken with rice.",
  tags: [],
  allergens: [],
});

const lentilSoup = makeMeal({
  name: "Red Lentil Soup",
  description: "Vegan red lentil soup.",
  tags: ["vegan", "vegetarian", "gluten-free"],
  allergens: [],
});

const yogurtParfait = makeMeal({
  name: "Greek Yogurt Parfait",
  description: "Yogurt and berries.",
  tags: ["vegetarian"],
  allergens: ["dairy"],
});

const blt = makeMeal({
  name: "BLT Sandwich",
  description: "Bacon, lettuce, tomato on bread.",
  tags: [],
  allergens: ["gluten"],
  steps: ["Fry bacon.", "Assemble sandwich."],
});

describe("mealSatisfiesDietLabel", () => {
  it("accepts any meal when diet is None", () => {
    expect(mealSatisfiesDietLabel(chicken, "None")).toBe(true);
  });

  it("rejects meat for Vegetarian and Vegan", () => {
    expect(mealSatisfiesDietLabel(chicken, "Vegetarian")).toBe(false);
    expect(mealSatisfiesDietLabel(lentilSoup, "Vegetarian")).toBe(true);
    expect(mealSatisfiesDietLabel(lentilSoup, "Vegan")).toBe(true);
    expect(mealSatisfiesDietLabel(yogurtParfait, "Vegan")).toBe(false);
  });

  it("rejects pork and alcohol for Halal", () => {
    expect(mealSatisfiesDietLabel(blt, "Halal")).toBe(false);
    expect(mealSatisfiesDietLabel(lentilSoup, "Halal")).toBe(true);
  });
});

describe("isSafeForUser", () => {
  it("hides meals that contain a listed allergen", () => {
    const dairyUser = makeProfile({ allergies: ["dairy"] });
    expect(isSafeForUser(yogurtParfait, dairyUser)).toBe(false);
    expect(isSafeForUser(lentilSoup, dairyUser)).toBe(true);
  });

  it("normalizes peanut → nuts", () => {
    const nutMeal = makeMeal({
      name: "Satay",
      allergens: ["nuts"],
      description: "Peanut sauce.",
    });
    expect(isSafeForUser(nutMeal, makeProfile({ allergies: ["peanut"] }))).toBe(false);
  });

  it("applies diet and allergy together", () => {
    const user = makeProfile({
      dietaryPreference: "Vegetarian",
      allergies: ["dairy"],
    });
    expect(isSafeForUser(chicken, user)).toBe(false);
    expect(isSafeForUser(yogurtParfait, user)).toBe(false);
    expect(isSafeForUser(lentilSoup, user)).toBe(true);
  });
});
