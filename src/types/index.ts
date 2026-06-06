export interface Recipe {
  name: string;
  cookTime: string;
  diet: string;
  description: string;
  steps: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export type RecipeResultItem = Recipe & {
  ingredientsUsed: string[];
  missingOptionalIngredients: string[];
  difficulty: "Easy" | "Medium" | "Hard";
  healthNote: string;
  substitutions: string[];
  /** When recipe comes from hardcoded meal library — exact allergen keys for banner. */
  hardcodedAllergens?: string[];
  /** How many distinct detected fridge ingredients matched this recipe. */
  ingredientMatchCount?: number;
};

export interface ApiResponse {
  ingredients: string[];
  recipes: Recipe[];
}

export type UserGoal = "lose_weight" | "build_muscle" | "maintain_weight";
export type ActivityLevel = "sedentary" | "light" | "gym_regular" | "athlete";
export type UserSex = "male" | "female" | "other";

export type CookingSkill = "beginner" | "home_cook" | "confident_cook";

/** Optional health priorities — used to boost matching meals (no AI). */
export type HealthFocusId =
  | "diabetes"
  | "heart"
  | "bone_joint"
  | "sleep_energy"
  | "sports"
  | "none";

export interface UserProfile {
  name: string;
  age: number;
  sex: UserSex;
  weightKg: number;
  heightCm: number;
  goal: UserGoal;
  activityLevel: ActivityLevel;
  goesToGym: boolean;
  dietaryPreference: DietFilter;
  allergies: string[];
  mealsPerDay: 2 | 3 | 4 | 5;
  /** Ingredients or dishes to de-prioritise; stored as discrete tags. */
  dislikedFoods: string[];
  /** Optional profile photo as data URL (stored in localStorage with profile). */
  avatarDataUri?: string | null;
  /** People you usually cook for (1–8). Default 1 when missing. */
  householdSize?: number;
  /** Prefer simpler, family-friendly recipe wording. */
  kidFriendly?: boolean;
  /** Optional weekly grocery budget in USD (UI hints only). */
  weeklyFoodBudgetUsd?: number | null;
  /** This week, bias meal suggestions toward higher protein. */
  proteinForwardWeek?: boolean;
  /** Preferred cuisines for filtering (canonical names). Empty = no preference. */
  cuisines?: string[];
  cookingSkill?: CookingSkill;
  /** @deprecated Use `cuisines` — kept for migration from older saves */
  cuisinePreferences?: string[];
  /** Optional; empty means no extra prioritisation. */
  healthFocuses?: HealthFocusId[];

  // ── Subscription fields (stored inside profile_data in Supabase) ──────────
  /** True when user has an active Pro subscription. */
  isPro?: boolean;
  /** Number of lifetime fridge scans used by this user. */
  freeScansUsed?: number;
  /** ISO-8601 expiry timestamp for the Pro subscription, or null. */
  subscriptionExpiresAt?: string | null;
}

export type DietFilter =
  | "None"
  | "Vegetarian"
  | "Vegan"
  | "Keto"
  | "Gluten-free"
  | "Pescatarian"
  | "Halal";

export type TimeFilter = "any" | "15" | "30" | "60";
