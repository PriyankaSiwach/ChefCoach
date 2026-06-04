import type { HealthFocusId, UserProfile, DietFilter } from "@/types";
import { MEAL_LIBRARY, MEALS_BY_TYPE } from "@/lib/mealLibrary";
import type { Meal, MealType, Allergen } from "@/lib/mealLibrary";

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a raw allergy/diet string to the allergen key we store on meals. */
function normaliseAllergen(raw: string): Allergen | null {
  const s = raw.toLowerCase().trim();
  const map: Record<string, Allergen> = {
    nuts: "nuts",
    nut: "nuts",
    peanut: "nuts",
    peanuts: "nuts",
    dairy: "dairy",
    milk: "dairy",
    lactose: "dairy",
    eggs: "eggs",
    egg: "eggs",
    shellfish: "shellfish",
    shrimp: "shellfish",
    prawns: "shellfish",
    soy: "soy",
    soya: "soy",
    gluten: "gluten",
    wheat: "gluten",
    fish: "fish",
    salmon: "fish",
    tuna: "fish",
    sesame: "sesame",
  };
  return map[s] ?? null;
}

const LAND_MEAT_RE =
  /\b(chicken|beef|pork|lamb|bacon|mince|steak|ribs|burger|chorizo|turkey|duck)\b/i;
const PORK_RE = /\b(pork|bacon|ham|chorizo|prosciutto|salami|pepperoni)\b/i;
const ALCOHOL_RE = /\b(wine|beer|sake|mirin|sherry|brandy|rum|vodka|liqueur)\b/i;

function mealTextBlob(meal: Meal): string {
  const ingredients = MEAL_INGREDIENTS[meal.name] ?? [];
  return `${meal.name} ${meal.description} ${meal.steps.join(" ")} ${ingredients.join(" ")}`.toLowerCase();
}

function mealContainsLandMeat(meal: Meal): boolean {
  return LAND_MEAT_RE.test(mealTextBlob(meal));
}

function mealContainsPork(meal: Meal): boolean {
  return PORK_RE.test(mealTextBlob(meal));
}

function mealContainsAlcohol(meal: Meal): boolean {
  return ALCOHOL_RE.test(mealTextBlob(meal));
}

function mealContainsFish(meal: Meal): boolean {
  return meal.allergens.includes("fish") || /\bfish\b|\bsalmon\b|\btuna\b|\btrout\b|\bcod\b/.test(mealTextBlob(meal));
}

export function mealSatisfiesDietLabel(meal: Meal, diet: DietFilter): boolean {
  if (diet === "None") return true;
  if (diet === "Keto") return meal.tags.includes("keto");
  if (diet === "Vegetarian") {
    return meal.tags.includes("vegetarian") || meal.tags.includes("vegan");
  }
  if (diet === "Vegan") return meal.tags.includes("vegan");
  if (diet === "Gluten-free") return meal.tags.includes("gluten-free");
  if (diet === "Pescatarian") {
    if (meal.tags.includes("vegan") || meal.tags.includes("vegetarian")) return true;
    return !mealContainsLandMeat(meal);
  }
  if (diet === "Halal") {
    return !mealContainsPork(meal) && !mealContainsAlcohol(meal);
  }
  return true;
}

/**
 * Returns true if the meal is safe to show to this user:
 *  1. Matches any of their dietary styles (or they have no restriction)
 *  2. Does not contain any of their flagged allergens
 *  3. Matches at least one preferred cuisine (or user has no preference)
 */
export function isSafeForUser(meal: Meal, profile: UserProfile): boolean {
  // ── Dietary filter ────────────────────────────────────────────────────────
  const dietPref = profile.dietaryPreference ?? "None";
  // dietaryPreference may be comma-joined e.g. "Vegetarian, Gluten-free"
  const diets = dietPref
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const hasDietRestriction = diets.some((d) => d !== "None");

  if (hasDietRestriction) {
    const ok = diets.every((d) => mealSatisfiesDietLabel(meal, d as DietFilter));
    if (!ok) return false;
  }

  // ── Allergen filter ───────────────────────────────────────────────────────
  for (const raw of profile.allergies ?? []) {
    if (!raw || raw === "None") continue;
    const lower = raw.toLowerCase().trim();
    if (lower === "pork" && mealContainsPork(meal)) return false;
    if (lower === "fish" && mealContainsFish(meal)) return false;
  }

  const userAllergens = (profile.allergies ?? [])
    .map(normaliseAllergen)
    .filter((a): a is Allergen => a !== null && a !== ("None" as Allergen));

  if (userAllergens.some((a) => meal.allergens.includes(a))) {
    return false;
  }

  // ── Cuisine preference filter ─────────────────────────────────────────────
  const prefs =
    profile.cuisines && profile.cuisines.length > 0
      ? profile.cuisines
      : ((profile as UserProfile & { cuisinePreferences?: string[] }).cuisinePreferences ??
        []);
  if (prefs.length > 0) {
    const hasCuisineMatch = prefs.some((c) =>
      (meal.cuisines as string[]).includes(c)
    );
    if (!hasCuisineMatch) return false;
  }

  return true;
}

/** Returns all meals that are safe for the user. Falls back to the full library if the filtered set would be empty. */
export function getSafeMeals(profile: UserProfile, type?: MealType): Meal[] {
  const pool = type ? MEALS_BY_TYPE[type] : MEAL_LIBRARY;
  const filtered = pool.filter((m) => isSafeForUser(m, profile));
  // Safety fallback: if cuisine filter wipes everything out, ignore cuisine
  if (filtered.length === 0) {
    const withoutCuisine = pool.filter((m) =>
      isSafeForUserNoCuisine(m, profile)
    );
    return withoutCuisine.length > 0 ? withoutCuisine : pool;
  }
  return filtered;
}

/** Same as isSafeForUser but ignores cuisine preference (used as fallback). */
function isSafeForUserNoCuisine(meal: Meal, profile: UserProfile): boolean {
  const profileNoCuisine = {
    ...profile,
    cuisines: [] as string[],
    cuisinePreferences: [] as string[],
  };
  return isSafeForUser(meal, profileNoCuisine);
}

/**
 * Deterministic meal picker for the weekly plan.
 * Uses (dayIndex + type-seed) % safeMeals.length so the same day always
 * shows the same meal while different meal types vary.
 */
export function getDailyMeal(
  type: MealType,
  dayIndex: number,
  profile: UserProfile
): Meal {
  const safe = getSafeMeals(profile, type);
  const typeSeed = type === "breakfast" ? 0 : type === "lunch" ? 7 : 14;
  return safe[(dayIndex + typeSeed) % safe.length];
}

/** Light heuristic: boost meals that align with onboarding health focus (no AI). */
export function mealHealthFocusScore(
  meal: Meal,
  focuses: HealthFocusId[] | undefined
): number {
  if (!focuses?.length) return 0;
  const f = new Set(focuses.filter((x) => x !== "none"));
  if (f.size === 0) return 0;
  let s = 0;
  if (f.has("diabetes")) {
    if (meal.tags.includes("keto") || meal.carbs_g <= 32) s += 2;
  }
  if (f.has("heart")) {
    if (meal.cuisines.includes("Mediterranean")) s += 2;
    if (meal.tags.includes("vegetarian") || meal.tags.includes("vegan")) s += 1;
  }
  if (f.has("bone_joint")) {
    if (meal.protein_g >= 24) s += 2;
    if (meal.allergens.includes("dairy")) s += 1;
  }
  if (f.has("sleep_energy")) {
    if (meal.carbs_g >= 28 && meal.carbs_g <= 52) s += 1;
  }
  if (f.has("sports")) {
    if (meal.protein_g >= 28) s += 2;
  }
  return s;
}

/** Returns meals from the safe pool, biased toward health focus then shuffled. */
export function getRandomMealIdeas(profile: UserProfile, count = 6): Meal[] {
  const pool = getSafeMeals(profile);
  const focuses = profile.healthFocuses?.filter((x) => x !== "none") ?? [];
  const boosted = [...pool].sort(
    (a, b) => mealHealthFocusScore(b, focuses) - mealHealthFocusScore(a, focuses)
  );
  const mix = boosted.slice(0, Math.min(boosted.length, Math.max(count * 3, count)));
  const shuffled = mix.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingredients map (keyed by meal name)
// ─────────────────────────────────────────────────────────────────────────────
export const MEAL_INGREDIENTS: Record<string, string[]> = {
  // BREAKFAST
  "Avocado Toast with Poached Eggs": [
    "sourdough bread",
    "avocado",
    "eggs",
    "lemon",
    "chilli flakes",
    "sea salt",
    "white vinegar",
  ],
  "Greek Yogurt Parfait": [
    "Greek yogurt",
    "granola",
    "mixed berries",
    "honey",
  ],
  "Banana Oat Pancakes": [
    "rolled oats",
    "banana",
    "eggs",
    "milk",
    "butter",
    "maple syrup",
  ],
  "Tropical Smoothie Bowl": [
    "frozen mango",
    "frozen pineapple",
    "coconut milk",
    "banana",
    "chia seeds",
    "shredded coconut",
    "granola",
  ],
  Shakshuka: [
    "eggs",
    "canned tomatoes",
    "red pepper",
    "onion",
    "garlic",
    "cumin",
    "paprika",
    "chilli flakes",
    "olive oil",
  ],
  "Overnight Oats": [
    "rolled oats",
    "milk",
    "chia seeds",
    "apple juice",
    "honey",
    "mixed berries",
  ],
  "Masala Omelette": [
    "eggs",
    "onion",
    "tomato",
    "green chilli",
    "turmeric",
    "red chilli powder",
    "salt",
    "oil",
  ],
  "French Toast": [
    "bread (thick slices)",
    "eggs",
    "milk",
    "vanilla extract",
    "cinnamon",
    "butter",
    "maple syrup",
  ],
  "Chia Seed Pudding": [
    "chia seeds",
    "coconut milk",
    "maple syrup",
    "mango",
    "lime",
  ],
  "Keto Bacon & Eggs": ["bacon", "eggs", "avocado", "salt", "black pepper"],
  "Italian Frittata": [
    "eggs",
    "cream",
    "courgette",
    "red pepper",
    "cherry tomatoes",
    "Parmesan",
    "olive oil",
  ],
  "Japanese Tamago Gohan": [
    "short-grain rice",
    "egg",
    "soy sauce",
    "sesame oil",
    "spring onion",
    "nori",
  ],
  "Spanish Tortilla de Patatas": [
    "potatoes",
    "onion",
    "eggs",
    "olive oil",
    "salt",
  ],
  "Blueberry Waffles": [
    "plain flour",
    "baking powder",
    "eggs",
    "milk",
    "butter",
    "blueberries",
    "vanilla extract",
    "maple syrup",
  ],
  "Protein Oatmeal Bowl": [
    "rolled oats",
    "milk",
    "protein powder",
    "almond butter",
    "banana",
    "honey",
    "cinnamon",
  ],
  "Coconut Chia Pudding": [
    "chia seeds",
    "coconut milk",
    "maple syrup",
    "kiwi",
    "passion fruit",
    "coconut flakes",
  ],
  "Egg & Veggie Breakfast Burrito": [
    "flour tortillas",
    "eggs",
    "black beans",
    "grated cheese",
    "avocado",
    "salsa",
    "butter",
    "cumin",
    "smoked paprika",
  ],
  "Bircher Muesli": [
    "rolled oats",
    "apple juice",
    "yogurt",
    "apple",
    "lemon",
    "honey",
    "almonds",
    "sunflower seeds",
    "mixed berries",
  ],
  "Acai Bowl": [
    "frozen acai pulp",
    "frozen blueberries",
    "almond milk",
    "granola",
    "banana",
    "strawberries",
    "coconut flakes",
  ],
  "Korean Egg Drop Soup": [
    "vegetable stock",
    "eggs",
    "soy sauce",
    "sesame oil",
    "white pepper",
    "spring onion",
  ],
  "Spinach & Feta Breakfast Wrap": [
    "flour tortilla",
    "eggs",
    "baby spinach",
    "feta",
    "olive oil",
  ],
  "Peanut Butter Banana Toast": [
    "whole-grain bread",
    "peanut butter",
    "banana",
    "honey",
    "cinnamon",
  ],

  // LUNCH
  "Chicken Caesar Salad": [
    "chicken breast",
    "romaine lettuce",
    "Caesar dressing",
    "Parmesan",
    "croutons",
    "lemon",
    "black pepper",
  ],
  "Red Lentil Soup": [
    "red lentils",
    "onion",
    "garlic",
    "cumin",
    "turmeric",
    "cayenne pepper",
    "vegetable stock",
    "lemon",
    "olive oil",
  ],
  "Quinoa Buddha Bowl": [
    "quinoa",
    "canned chickpeas",
    "cucumber",
    "cherry tomatoes",
    "avocado",
    "tahini",
    "lemon",
    "paprika",
    "cumin",
  ],
  "BLT Sandwich": [
    "back bacon",
    "bread",
    "lettuce",
    "tomato",
    "mayonnaise",
    "salt",
    "black pepper",
  ],
  "Chicken Tikka Wrap": [
    "chicken breast",
    "flatbread",
    "yogurt",
    "tikka spice paste",
    "lemon",
    "mint",
    "lettuce",
    "tomato",
    "red onion",
  ],
  "Tuna Poke Bowl": [
    "sushi-grade tuna",
    "sushi rice",
    "edamame",
    "cucumber",
    "avocado",
    "soy sauce",
    "sesame oil",
    "sriracha",
    "pickled ginger",
    "sesame seeds",
    "spring onion",
  ],
  "Falafel Pitta": [
    "canned chickpeas",
    "garlic",
    "cumin",
    "coriander",
    "parsley",
    "plain flour",
    "pitta bread",
    "hummus",
    "tahini",
    "lettuce",
    "tomato",
  ],
  "Thai Peanut Noodles": [
    "rice noodles",
    "peanut butter",
    "soy sauce",
    "lime",
    "garlic",
    "chilli",
    "carrot",
    "cucumber",
    "red cabbage",
    "crushed peanuts",
    "fresh coriander",
  ],
  "Greek Salad with Chicken": [
    "chicken breast",
    "tomatoes",
    "cucumber",
    "red onion",
    "Kalamata olives",
    "feta",
    "dried oregano",
    "olive oil",
    "red wine vinegar",
  ],
  "Mexican Chicken Burrito Bowl": [
    "long-grain rice",
    "chicken thighs",
    "canned black beans",
    "corn",
    "salsa",
    "sour cream",
    "avocado",
    "smoked paprika",
    "cumin",
    "chipotle paste",
  ],
  "Italian Caprese": [
    "buffalo mozzarella",
    "heirloom tomatoes",
    "fresh basil",
    "extra-virgin olive oil",
    "balsamic glaze",
    "sea salt",
    "black pepper",
  ],
  "Miso Tofu Soup": [
    "white miso paste",
    "silken tofu",
    "wakame seaweed",
    "spring onion",
  ],
  "Spanish Gazpacho": [
    "ripe tomatoes",
    "cucumber",
    "red pepper",
    "green pepper",
    "garlic",
    "olive oil",
    "sherry vinegar",
    "salt",
  ],
  "BBQ Chicken Sandwich": [
    "chicken thighs",
    "BBQ sauce",
    "brioche buns",
    "white cabbage",
    "carrot",
    "coleslaw dressing",
    "pickles",
  ],
  "Mediterranean Hummus Plate": [
    "canned chickpeas",
    "tahini",
    "garlic",
    "lemon",
    "olive oil",
    "cumin",
    "pitta bread",
    "Kalamata olives",
    "cucumber",
    "carrot",
    "cherry tomatoes",
  ],
  "Egg Fried Rice": [
    "cooked rice (day-old)",
    "eggs",
    "frozen peas",
    "soy sauce",
    "sesame oil",
    "spring onion",
    "white pepper",
    "oil",
  ],
  "Vietnamese Spring Rolls": [
    "rice paper sheets",
    "rice vermicelli",
    "prawns",
    "carrot",
    "cucumber",
    "fresh mint",
    "peanut sauce",
  ],
  "Tomato Basil Soup": [
    "ripe tomatoes",
    "garlic",
    "olive oil",
    "vegetable stock",
    "fresh basil",
    "salt",
    "black pepper",
  ],
  "Chickpea Spinach Stew": [
    "canned chickpeas",
    "canned tomatoes",
    "baby spinach",
    "onion",
    "garlic",
    "ginger",
    "cumin",
    "coriander",
    "paprika",
    "olive oil",
  ],
  "Smoked Salmon Bagel": [
    "plain bagel",
    "cream cheese",
    "smoked salmon",
    "red onion",
    "capers",
    "tomato",
    "cucumber",
    "lemon",
    "black pepper",
  ],
  "Korean Bibimbap (lunch)": [
    "short-grain rice",
    "baby spinach",
    "bean sprouts",
    "carrot",
    "egg",
    "soy sauce",
    "sesame oil",
    "gochujang sauce",
  ],

  // DINNER
  "Chicken Tikka Masala": [
    "chicken thighs",
    "yogurt",
    "tikka spice paste",
    "crushed tomatoes",
    "cream",
    "onion",
    "garlic",
    "ginger",
    "cumin",
    "garam masala",
    "fresh coriander",
    "basmati rice",
  ],
  "Spaghetti Bolognese": [
    "spaghetti",
    "minced beef",
    "onion",
    "celery",
    "carrot",
    "crushed tomatoes",
    "tomato purée",
    "red wine",
    "olive oil",
    "Parmesan",
    "garlic",
  ],
  "Grilled Salmon with Asparagus": [
    "salmon fillets",
    "asparagus",
    "butter",
    "lemon",
    "capers",
    "smoked paprika",
    "olive oil",
  ],
  "Black Bean Tacos": [
    "corn tortillas",
    "canned black beans",
    "mango",
    "red onion",
    "fresh coriander",
    "lime",
    "avocado",
    "chipotle sauce",
    "cumin",
    "smoked paprika",
  ],
  "Butter Chicken": [
    "chicken thighs",
    "yogurt",
    "butter",
    "cream",
    "onion",
    "cashews",
    "crushed tomatoes",
    "cumin",
    "coriander",
    "garam masala",
    "fenugreek leaves",
    "basmati rice",
  ],
  "Beef & Vegetable Stir Fry": [
    "beef steak",
    "soy sauce",
    "oyster sauce",
    "garlic",
    "ginger",
    "broccoli",
    "red pepper",
    "snap peas",
    "sesame oil",
    "steamed rice",
  ],
  "Shrimp Linguine": [
    "linguine",
    "large prawns",
    "garlic",
    "butter",
    "white wine",
    "lemon",
    "fresh parsley",
    "chilli flakes",
    "olive oil",
  ],
  "Thai Green Vegetable Curry": [
    "green curry paste",
    "coconut milk",
    "vegetable stock",
    "broccoli",
    "courgette",
    "baby corn",
    "mangetout",
    "baby spinach",
    "Thai basil",
    "jasmine rice",
    "lime",
  ],
  "Classic Cheeseburger": [
    "beef mince",
    "brioche buns",
    "cheddar cheese",
    "lettuce",
    "tomato",
    "onion",
    "mayonnaise",
    "ketchup",
    "Worcestershire sauce",
  ],
  "Spanish Seafood Paella": [
    "paella rice",
    "prawns",
    "mussels",
    "squid",
    "chorizo",
    "onion",
    "garlic",
    "crushed tomatoes",
    "saffron",
    "smoked paprika",
    "fish stock",
    "lemon",
  ],
  "Japanese Teriyaki Chicken": [
    "chicken thighs",
    "soy sauce",
    "mirin",
    "sake",
    "sugar",
    "sesame seeds",
    "steamed rice",
    "broccoli",
  ],
  "Italian Chicken Piccata": [
    "chicken breasts",
    "plain flour",
    "eggs",
    "olive oil",
    "white wine",
    "lemon",
    "capers",
    "butter",
    "fresh parsley",
    "linguine",
  ],
  "Mexican Chicken Enchiladas": [
    "flour tortillas",
    "cooked chicken",
    "canned black beans",
    "cheddar cheese",
    "enchilada sauce",
    "sour cream",
    "fresh coriander",
    "smoked paprika",
  ],
  "Indian Dal Tadka": [
    "yellow lentils",
    "onion",
    "garlic",
    "ginger",
    "cumin seeds",
    "tomatoes",
    "turmeric",
    "red dried chilli",
    "ghee",
    "fresh coriander",
    "basmati rice",
  ],
  "American BBQ Ribs": [
    "pork ribs",
    "BBQ sauce",
    "brown sugar",
    "smoked paprika",
    "garlic powder",
    "white cabbage",
    "carrot",
    "coleslaw dressing",
    "corn on the cob",
  ],
  "Mediterranean Stuffed Peppers": [
    "bell peppers",
    "quinoa",
    "cherry tomatoes",
    "Kalamata olives",
    "feta",
    "fresh herbs (parsley, oregano)",
    "olive oil",
  ],
  "Moroccan Lamb Tagine": [
    "lamb shoulder",
    "onion",
    "garlic",
    "ginger",
    "cumin",
    "coriander",
    "cinnamon",
    "turmeric",
    "preserved lemon",
    "dried apricots",
    "lamb stock",
    "toasted almonds",
    "fresh mint",
    "couscous",
  ],
  "Pesto Pasta with Roasted Tomatoes": [
    "pasta",
    "fresh basil",
    "pine nuts",
    "Parmesan",
    "garlic",
    "olive oil",
    "cherry tomatoes",
  ],
  "Korean Bibimbap": [
    "short-grain rice",
    "beef steak",
    "baby spinach",
    "bean sprouts",
    "carrot",
    "eggs",
    "soy sauce",
    "sesame oil",
    "gochujang sauce",
  ],
  "Vegan Chickpea Curry": [
    "canned chickpeas",
    "canned tomatoes",
    "coconut milk",
    "onion",
    "garlic",
    "ginger",
    "curry powder",
    "garam masala",
    "turmeric",
    "baby spinach",
    "basmati rice",
  ],
  "French Ratatouille": [
    "aubergine",
    "courgette",
    "red pepper",
    "yellow pepper",
    "onion",
    "garlic",
    "canned tomatoes",
    "fresh thyme",
    "fresh basil",
    "olive oil",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Hero ingredient
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the main protein/hero ingredient name for a meal, derived from its name and description. */
export function getHeroIngredient(meal: Meal): string {
  const txt = `${meal.name} ${meal.description}`.toLowerCase();
  if (/salmon|sea bass|cod|halibut|trout/.test(txt)) return "Salmon";
  if (/tuna/.test(txt)) return "Tuna";
  if (/prawn|shrimp/.test(txt)) return "Prawns";
  if (/mussel|clam|scallop|oyster/.test(txt)) return "Shellfish";
  if (/chicken|tikka|teriyaki/.test(txt)) return "Chicken";
  if (/lamb/.test(txt)) return "Lamb";
  if (/beef|bolognese|mince|burger|steak|rib/.test(txt)) return "Beef";
  if (/pork|bacon/.test(txt)) return "Pork";
  if (/egg|omelette|frittata|shakshuka|french toast|poach/.test(txt)) return "Eggs";
  if (/tofu/.test(txt)) return "Tofu";
  if (/chickpea|hummus|falafel/.test(txt)) return "Chickpeas";
  if (/lentil|dal/.test(txt)) return "Lentils";
  if (/black bean|bean/.test(txt)) return "Black Beans";
  if (/quinoa/.test(txt)) return "Quinoa";
  if (/yogurt|parfait/.test(txt)) return "Greek Yogurt";
  if (/oat|bircher/.test(txt)) return "Oats";
  if (/mozzarella|feta|parmesan|cheese/.test(txt)) return "Cheese";
  if (/chia/.test(txt)) return "Chia Seeds";
  if (/avocado/.test(txt)) return "Avocado";
  return "Mixed protein";
}

/**
 * Given a list of meal names from the current week plan, build a deduplicated
 * grocery list by looking up the MEAL_INGREDIENTS map.
 */
export function buildGroceryFromPlan(mealNames: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const name of mealNames) {
    const ingredients = MEAL_INGREDIENTS[name] ?? [];
    for (const ing of ingredients) {
      const key = ing.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(ing);
    }
  }
  return list;
}

/** Collect all non-empty meal names from a weekly plan. */
export function extractPlanMealNames(
  plan: Array<{ breakfast: string; lunch: string; dinner: string }>
): string[] {
  const names: string[] = [];
  for (const d of plan) {
    for (const name of [d.breakfast, d.lunch, d.dinner]) {
      const t = name.trim();
      if (t) names.push(t);
    }
  }
  return names;
}
