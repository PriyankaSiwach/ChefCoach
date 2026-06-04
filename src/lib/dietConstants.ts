import type { DietFilter, UserProfile } from "@/types";

/** Onboarding / edit-profile dietary style chips (single-select). */
export const DIETARY_STYLE_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Keto",
  "Gluten-free",
  "Pescatarian",
  "Halal",
] as const satisfies readonly DietFilter[];

export type DietStyleOption = (typeof DIETARY_STYLE_OPTIONS)[number];

export function isDietStyleOption(value: string): value is DietStyleOption {
  return (DIETARY_STYLE_OPTIONS as readonly string[]).includes(value);
}

/** Allergy chips shown in onboarding and edit profile. */
export const ALLERGY_OPTIONS = [
  "Nuts",
  "Dairy",
  "Eggs",
  "Shellfish",
  "Soy",
  "Gluten",
  "Fish",
  "Pork",
  "None",
] as const;

/** Cook-tab quick filter chips (includes None). */
export const COOK_DIET_FILTER_OPTIONS: Array<{ label: string; value: DietFilter }> = [
  { label: "🍽️ No filter", value: "None" },
  { label: "🌿 Vegetarian", value: "Vegetarian" },
  { label: "🥦 Vegan", value: "Vegan" },
  { label: "🐟 Pescatarian", value: "Pescatarian" },
  { label: "☪️ Halal", value: "Halal" },
  { label: "🥩 Keto", value: "Keto" },
  { label: "🌾 Gluten-free", value: "Gluten-free" },
];

/**
 * System-prompt line for AI recipe / vision flows.
 * Example: "User is vegetarian, allergic to nuts, dislikes mushrooms — never include these in any recipe suggestions."
 */
export function buildUserDietaryRestrictionsPrompt(
  profile: UserProfile | null | undefined
): string {
  if (!profile) return "";

  const clauses: string[] = [];
  const diet = profile.dietaryPreference;
  if (diet && diet !== "None") {
    clauses.push(`User is ${diet.toLowerCase()}`);
  }

  const allergies = (profile.allergies ?? []).filter((a) => a !== "None");
  if (allergies.length) {
    clauses.push(
      `allergic to ${allergies.map((a) => a.toLowerCase()).join(", ")}`
    );
  }

  const dislikes = (profile.dislikedFoods ?? []).filter(Boolean);
  if (dislikes.length) {
    clauses.push(`dislikes ${dislikes.map((d) => d.toLowerCase()).join(", ")}`);
  }

  if (!clauses.length) return "";
  return ` ${clauses.join(", ")} — never include these in any recipe suggestions.`;
}
