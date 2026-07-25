
import { useEffect, useMemo, useRef, useState } from "react";
import type { Recipe, RecipeResultItem } from "@/types";
import { readProfileFromStorage } from "@/lib/profileStorage";
import { getRecipeRating } from "@/lib/recipe-ratings";
import { useCountUp } from "@/hooks/useCountUp";
import { MacroPills } from "./MacroPills";
import { NutritionDisclaimer } from "./NutritionDisclaimer";
import { RecipeModal } from "./RecipeModal";
import { ChartIcon, ClockIcon, IconLabel, LockIcon, TrophyIcon } from "@/components/icons/AppIcons";
import { AllergenBadge } from "./AllergenBadge";

type Props = {
  items: RecipeResultItem[];
  favourites: Recipe[];
  highlightRecipeName?: string | null;
  onSave: (recipe: Recipe) => void;
  onLogMeal: (recipe: Recipe) => void;
  recipesLocked?: boolean;
  onUpgrade?: () => void;
  /** User's flagged allergens — from the profile stored in localStorage. */
  userAllergens?: string[];
};

function AnimatedMacroPills({
  calories,
  protein,
  carbs,
  fat,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  const caloriesCount = useCountUp(calories, 800);
  const proteinCount = useCountUp(protein, 800);
  const carbsCount = useCountUp(carbs, 800);
  const fatCount = useCountUp(fat, 800);

  return (
    <MacroPills
      className="mt-4 flex-nowrap overflow-x-auto"
      calories={caloriesCount}
      protein={proteinCount}
      carbs={carbsCount}
      fat={fatCount}
    />
  );
}

/**
 * Attempt to infer common allergens from an AI-generated recipe's name,
 * description and diet label. Not exhaustive — just best-effort safety hints.
 */
function inferAllergens(item: RecipeResultItem): string[] {
  if (item.hardcodedAllergens?.length) return [...item.hardcodedAllergens];
  const text = `${item.name} ${item.description} ${item.diet}`.toLowerCase();
  const found: string[] = [];
  if (/milk|cream|cheese|butter|yogurt|dairy|béchamel|parmesan|mozzarella|feta|ricotta/.test(text))
    found.push("dairy");
  if (/flour|bread|pasta|spaghetti|noodle|wheat|gluten|tortilla|wrap|pita|bun|roll|crouton/.test(text))
    found.push("gluten");
  if (/egg|omelette|frittata|quiche|meringue|hollandaise/.test(text))
    found.push("eggs");
  if (/nut|almond|cashew|walnut|pecan|hazelnut|pistachio|peanut/.test(text))
    found.push("nuts");
  if (/shrimp|prawn|crab|lobster|shellfish|clam|mussel|scallop|oyster/.test(text))
    found.push("shellfish");
  if (/soy|tofu|edamame|miso|tempeh|teriyaki|hoisin/.test(text))
    found.push("soy");
  if (/salmon|tuna|cod|halibut|tilapia|anchov|sardine|sea bass|trout/.test(text))
    found.push("fish");
  if (/sesame|tahini/.test(text)) found.push("sesame");
  return found;
}

export function RecipeResults({
  items,
  favourites,
  highlightRecipeName = null,
  onSave,
  onLogMeal,
  recipesLocked = false,
  onUpgrade,
  userAllergens = [],
}: Props) {
  const [openRecipe, setOpenRecipe] = useState<RecipeResultItem | null>(null);
  const [, setRatingTick] = useState(0);
  const modalHistorySynced = useRef(false);

  useEffect(() => {
    const up = () => setRatingTick((t) => t + 1);
    window.addEventListener("recipify-ratings-changed", up);
    return () => window.removeEventListener("recipify-ratings-changed", up);
  }, []);

  useEffect(() => {
    if (!openRecipe) {
      modalHistorySynced.current = false;
      return;
    }
    if (!modalHistorySynced.current) {
      window.history.pushState({ recipifyRecipeModal: true }, "");
      modalHistorySynced.current = true;
    } else {
      window.history.replaceState({ recipifyRecipeModal: true }, "");
    }
  }, [openRecipe?.name]);

  useEffect(() => {
    const onPop = () => {
      setOpenRecipe(null);
      modalHistorySynced.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const closeRecipeModal = () => {
    if (openRecipe && modalHistorySynced.current) {
      window.history.back();
    } else {
      setOpenRecipe(null);
      modalHistorySynced.current = false;
    }
  };

  const proteinTarget = useMemo(() => {
    const parsed = readProfileFromStorage();
    if (!parsed || !parsed.age) return 0;
    try {
      const age = parsed.age;
      const weightKg = parsed.weightKg ?? 0;
      const heightCm = parsed.heightCm ?? 0;
      const sex = parsed.sex ?? "female";
      const goal = parsed.goal ?? "maintain_weight";
      const activity = parsed.activityLevel ?? "light";
      const bmr =
        sex === "male"
          ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
          : sex === "female"
            ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
            : 10 * weightKg + 6.25 * heightCm - 5 * age;
      const activityMult =
        activity === "sedentary"
          ? 1.2
          : activity === "light"
            ? 1.375
            : activity === "gym_regular"
              ? 1.55
              : 1.725;
      let calories = Math.round(bmr * activityMult);
      if (goal === "lose_weight") calories -= 300;
      if (goal === "build_muscle") calories += 300;
      const proteinRatio =
        goal === "lose_weight" ? 0.35 : goal === "build_muscle" ? 0.3 : 0.25;
      return Math.max(0, Math.round((calories * proteinRatio) / 4));
    } catch {
      return 0;
    }
  }, []);

  if (!items.length) return null;

  return (
    <section className="space-y-4">
      {items.map((item, index) => {
        const isSaved = favourites.some((f) => f.name === item.name);
        const rated = getRecipeRating(item.name);
        const isBest = highlightRecipeName != null && item.name === highlightRecipeName;
        const inferredAllergens = inferAllergens(item);
        return (
          <article
            key={item.name}
            className={`relative overflow-hidden rounded-2xl shadow-sm transition hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)] ${
              isBest
                ? "border-2 border-transparent bg-gradient-to-br from-[#f4f8ee] via-white to-[#eaf3df] [box-shadow:0_0_0_2px_rgba(45,80,22,0.35),0_12px_28px_rgba(45,80,22,0.12)]"
                : "border border-[var(--border)] bg-[var(--white)]"
            }`}
            style={{ animation: "fadeInUp 0.4s ease both", animationDelay: `${index * 0.15}s` }}
          >
            <div
              className={`${recipesLocked ? "pointer-events-none blur-[8px]" : ""}`}
            >
            <div className="px-5 pb-4 pt-5">
              {isBest ? (
                <span
                  className="mb-2 inline-flex items-center gap-1 rounded-full bg-[var(--green)] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
                >
                  <IconLabel icon={<TrophyIcon className="h-3 w-3" />}>Best for your goal</IconLabel>
                </span>
              ) : null}
              <h3 className="font-playfair text-[22px] leading-tight text-[var(--text)]">
                {item.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--gray)]">
                {item.description}
              </p>
              {rated ? (
                <p className="mt-2 text-xs text-[var(--green)]" aria-label="Your rating">
                  You rated: {"★".repeat(rated.stars)}
                  {"☆".repeat(5 - rated.stars)}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[var(--green-pale)] px-3 py-1 font-medium text-[var(--green)]">
                  <IconLabel icon={<ClockIcon />}>{item.cookTime}</IconLabel>
                </span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--white)] px-3 py-1 font-medium text-[var(--gray)]">
                  {item.difficulty}
                </span>
              </div>

              <div className="mt-4">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--gray)]">
                  Ingredients matched from your scan
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.ingredientsUsed.length ? (
                    item.ingredientsUsed.map((ing) => (
                      <span
                        key={`${item.name}-${ing}`}
                        className="rounded-full bg-[var(--green-pale)] px-3 py-1 text-xs text-[var(--green)]"
                      >
                        {ing}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs italic text-[var(--gray)]">
                      No direct overlap — still a great profile-safe pick from the library.
                    </span>
                  )}
                </div>
                {typeof item.ingredientMatchCount === "number" && item.ingredientMatchCount > 0 ? (
                  <p className="mt-2 text-[11px] text-[var(--green)]">
                    Uses {item.ingredientMatchCount} detected ingredient
                    {item.ingredientMatchCount === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>

              <div className="mt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--gray)]">
                  Missing optional ingredients
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.missingOptionalIngredients.map((ing) => (
                    <span
                      key={`${item.name}-optional-${ing}`}
                      className="rounded-full bg-[var(--orange-pale)] px-3 py-1 text-xs text-[var(--orange)]"
                    >
                      {ing}
                    </span>
                  ))}
                </div>
              </div>

              <AnimatedMacroPills
                calories={item.calories}
                protein={item.protein_g}
                carbs={item.carbs_g}
                fat={item.fat_g}
              />

              <NutritionDisclaimer inline className="mt-1.5" />

              <AllergenBadge
                allergens={inferredAllergens}
                userAllergens={userAllergens}
                hideByDefault
              />

              <div className="mt-3">
                <p className="mb-1 text-xs text-[var(--gray)]">
                  This covers{" "}
                  {proteinTarget > 0
                    ? `${Math.min(100, Math.round((item.protein_g / proteinTarget) * 100))}%`
                    : "0%"}{" "}
                  of your daily protein goal
                </p>
                <div className="h-1.5 rounded-full bg-[var(--gray-light)]">
                  <div
                    className="h-full rounded-full bg-[var(--green)]"
                    style={{
                      width:
                        proteinTarget > 0
                          ? `${Math.min(100, (item.protein_g / proteinTarget) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--gray-light)] px-5 py-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setOpenRecipe(item)}
                  className="flex-1 rounded-full border border-[var(--border)] bg-[var(--white)] px-4 py-2 text-sm text-[var(--gray)]"
                >
                  View Recipe
                </button>
                <button
                  onClick={() => onLogMeal(item)}
                  className="flex-1 rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-4 py-2 text-sm font-medium text-[var(--green)]"
                >
                  <IconLabel icon={<ChartIcon className="h-4 w-4" />}>Log Meal</IconLabel>
                </button>
                <button
                  type="button"
                  onClick={() => onSave(item)}
                  aria-pressed={isSaved}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isSaved
                      ? "border-2 border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)] shadow-none hover:bg-[var(--green)]/10"
                      : "bg-[var(--green)] text-white shadow-sm hover:brightness-[1.03]"
                  }`}
                >
                  {isSaved ? "Unsave" : "Save"}
                </button>
              </div>
            </div>
            </div>
            {recipesLocked ? (
              <button
                type="button"
                onClick={onUpgrade}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--cream)]/90 px-6 backdrop-blur-[3px]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--green-pale)] text-3xl shadow-inner" aria-hidden>
                <LockIcon className="h-7 w-7 text-[var(--green)]" />
                </span>
                <span className="font-playfair text-lg text-[var(--green)]">Unlock these recipes</span>
                <span className="max-w-[260px] text-center text-sm leading-snug text-[var(--gray)]">
                  Go unlimited with scans, full steps, and saved meals — all in one place.
                </span>
                <span className="mt-1 rounded-full bg-[var(--green)] px-5 py-2.5 text-sm font-semibold text-white shadow-md">
                  View plans
                </span>
              </button>
            ) : null}
          </article>
        );
      })}

      <RecipeModal
        recipe={openRecipe}
        open={openRecipe !== null && !recipesLocked}
        onClose={closeRecipeModal}
        isSaved={openRecipe ? favourites.some((f) => f.name === openRecipe.name) : false}
        onToggleSave={onSave}
        onLogMeal={onLogMeal}
      />
    </section>
  );
}
