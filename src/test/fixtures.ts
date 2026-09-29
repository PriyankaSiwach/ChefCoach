import type { UserProfile } from "@/types";
import type { Meal } from "@/lib/mealLibrary";

export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: "Test",
    age: 24,
    sex: "female",
    weightKg: 60,
    heightCm: 165,
    goal: "maintain_weight",
    activityLevel: "light",
    goesToGym: false,
    dietaryPreference: "None",
    allergies: [],
    mealsPerDay: 3,
    dislikedFoods: [],
    cuisines: [],
    ...overrides,
  };
}

export function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "t1",
    name: "Test Meal",
    type: "lunch",
    calories: 400,
    protein_g: 20,
    carbs_g: 40,
    fat_g: 12,
    tags: [],
    allergens: [],
    cuisines: ["American"],
    steps: ["Prep.", "Cook.", "Serve."],
    description: "A test meal.",
    ...overrides,
  };
}
