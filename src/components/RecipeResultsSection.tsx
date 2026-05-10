import type { Recipe, RecipeResultItem, UserProfile } from "@/types";
import { IngredientsFound } from "./IngredientsFound";
import { RecipeResults } from "./RecipeResults";
import { TrialEndedBanner } from "./TrialEndedBanner";

function computeBestMatchRecipe(
  items: RecipeResultItem[],
  goal: UserProfile["goal"] | undefined
): RecipeResultItem | null {
  if (!items.length) return null;
  const g = goal ?? "maintain_weight";
  if (g === "build_muscle") {
    return [...items].reduce((a, b) => (a.protein_g >= b.protein_g ? a : b));
  }
  if (g === "lose_weight") {
    return [...items].reduce((a, b) => (a.calories <= b.calories ? a : b));
  }
  const avgP = items.reduce((s, i) => s + i.protein_g, 0) / items.length;
  const avgC = items.reduce((s, i) => s + i.carbs_g, 0) / items.length;
  const avgF = items.reduce((s, i) => s + i.fat_g, 0) / items.length;
  return [...items].reduce((best, cur) => {
    const db =
      Math.abs(best.protein_g - avgP) + Math.abs(best.carbs_g - avgC) + Math.abs(best.fat_g - avgF);
    const dc =
      Math.abs(cur.protein_g - avgP) + Math.abs(cur.carbs_g - avgC) + Math.abs(cur.fat_g - avgF);
    return dc < db ? cur : best;
  });
}

type Props = {
  error: string | null;
  loading: boolean;
  ingredients: string[];
  recipes: RecipeResultItem[];
  /** Pool size before diet/time filter — used for empty-filter messaging */
  matchedRecipePoolCount: number;
  favourites: Recipe[];
  profile: UserProfile | null;
  onToggleFavourite: (recipe: Recipe) => void;
  onRemoveIngredient: (ingredient: string) => void;
  onAddIngredient: (ingredient: string) => void;
  onGenerateRecipes: () => void;
  onLogMeal: (recipe: Recipe) => void;
  onReset: () => void;
  showTrialEndedBanner?: boolean;
  recipesLocked?: boolean;
  onUpgrade?: () => void;
};

export function RecipeResultsSection({
  error,
  loading,
  ingredients,
  recipes,
  matchedRecipePoolCount,
  favourites,
  profile,
  onToggleFavourite,
  onRemoveIngredient,
  onAddIngredient,
  onGenerateRecipes,
  onLogMeal,
  onReset,
  showTrialEndedBanner = false,
  recipesLocked = false,
  onUpgrade,
}: Props) {
  const bestMatch = recipes.length > 0 ? computeBestMatchRecipe(recipes, profile?.goal) : null;

  return (
    <>
      {error ? (
        <div className="mx-auto mb-4 max-w-[600px] px-5">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        </div>
      ) : null}

      <IngredientsFound
        ingredients={ingredients}
        loading={loading}
        onRemoveIngredient={onRemoveIngredient}
        onAddIngredient={onAddIngredient}
        onGenerateRecipes={onGenerateRecipes}
        userAllergens={(profile?.allergies ?? []).filter((a) => a !== "None")}
      />

      <section className="mx-auto max-w-[600px] px-5 pb-24 md:pb-12">
        {matchedRecipePoolCount > 0 && recipes.length > 0 ? (
          <p className="mb-3 rounded-lg border border-[var(--green)]/30 bg-[var(--green-pale)]/60 px-3 py-2 text-xs text-[var(--green)]">
            Recipes matched from your ingredients — ranked by how many items from your scan they use.
          </p>
        ) : null}
        {matchedRecipePoolCount > 0 && recipes.length === 0 && ingredients.length > 0 ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No recipes match your current <strong>diet</strong> and <strong>cook time</strong> filters.
            Adjust the chips above or tap &quot;Apply filter&quot; on the suggestion card to see matches again.
          </div>
        ) : null}
        {recipes.length ? (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-playfair text-2xl text-[var(--green)]">Your Recipes</h2>
            <button
              onClick={onReset}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-xs text-[var(--gray)]"
            >
              Try Again
            </button>
          </div>
        ) : null}
        {bestMatch && recipes.length > 0 ? (
          <div className="mb-4 rounded-xl border border-[var(--green)]/25 bg-gradient-to-r from-[var(--green-pale)] to-[var(--cream)] px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--green)]">
              📊 Today&apos;s best pick for your goals:
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 font-playfair text-lg text-[var(--text)]">
              {bestMatch.name}
              <span className="rounded-full bg-[var(--green)] px-2.5 py-0.5 text-[10px] font-bold text-white">
                Best Match 🏆
              </span>
            </p>
          </div>
        ) : null}
        {showTrialEndedBanner && onUpgrade ? (
          <TrialEndedBanner onUpgrade={onUpgrade} />
        ) : null}
        <RecipeResults
          items={recipes}
          favourites={favourites}
          highlightRecipeName={bestMatch?.name ?? null}
          onSave={onToggleFavourite}
          onLogMeal={onLogMeal}
          recipesLocked={recipesLocked}
          onUpgrade={onUpgrade}
          userAllergens={(profile?.allergies ?? []).filter((a) => a !== "None")}
        />
      </section>
    </>
  );
}
