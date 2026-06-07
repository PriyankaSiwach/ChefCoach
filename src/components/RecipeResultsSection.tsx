import type { Recipe, RecipeResultItem, UserProfile } from "@/types";
import { IconLabel, SparklesIcon, TrophyIcon } from "@/components/icons/AppIcons";
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
  loadingMessage?: string;
  ingredients: string[];
  hasUploadedPhoto: boolean;
  recipes: RecipeResultItem[];
  /** Pool size before diet/time filter — used for empty-filter messaging */
  matchedRecipePoolCount: number;
  favourites: Recipe[];
  profile: UserProfile | null;
  onToggleFavourite: (recipe: Recipe) => void;
  onRemoveIngredient: (ingredient: string) => void;
  onAddIngredient: (ingredient: string) => void;
  onGenerateRecipes: () => void;
  onGenerateMore?: () => void;
  loadingMore?: boolean;
  canGenerateMore?: boolean;
  onLogMeal: (recipe: Recipe) => void;
  onReset: () => void;
  showTrialEndedBanner?: boolean;
  recipesLocked?: boolean;
  onUpgrade?: () => void;
};

export function RecipeResultsSection({
  error,
  loading,
  loadingMessage,
  ingredients,
  hasUploadedPhoto,
  recipes,
  matchedRecipePoolCount,
  favourites,
  profile,
  onToggleFavourite,
  onRemoveIngredient,
  onAddIngredient,
  onGenerateRecipes,
  onGenerateMore,
  loadingMore = false,
  canGenerateMore = false,
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
        <div className="app-shell mb-4 px-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      <IngredientsFound
        ingredients={ingredients}
        hasUploadedPhoto={hasUploadedPhoto}
        loading={loading}
        loadingMessage={loadingMessage}
        onRemoveIngredient={onRemoveIngredient}
        onAddIngredient={onAddIngredient}
        onGenerateRecipes={onGenerateRecipes}
        userAllergens={(profile?.allergies ?? []).filter((a) => a !== "None")}
      />

      <section className="app-shell px-4 pb-4">
        {matchedRecipePoolCount > 0 && recipes.length > 0 ? (
          <p className="mb-3 rounded-lg border border-[var(--green)]/30 bg-[var(--green-pale)]/60 px-3 py-2 text-xs text-[var(--green)]">
            AI recipes tailored to your scanned ingredients — adjust diet and cook time filters above to refine results.
          </p>
        ) : null}
        {matchedRecipePoolCount > 0 && recipes.length === 0 && ingredients.length > 0 ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No recipes match your current <strong>diet</strong> and <strong>cook time</strong> filters.
            Adjust the diet and cook time chips above to see matches again.
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
              Today&apos;s best pick for your goals:
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 font-playfair text-lg text-[var(--text)]">
              {bestMatch.name}
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--green)] px-2.5 py-0.5 text-[10px] font-bold text-white">
                <IconLabel icon={<TrophyIcon className="h-3 w-3" />}>Best Match</IconLabel>
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
        {canGenerateMore && onGenerateMore ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onGenerateMore}
              disabled={loadingMore || recipesLocked}
              className="rounded-full border-2 border-[var(--green)] bg-[var(--green-pale)] px-6 py-3 text-sm font-semibold text-[var(--green)] transition hover:bg-[var(--green)] hover:text-white disabled:opacity-60"
            >
              <IconLabel icon={<SparklesIcon className="h-4 w-4" />}>
                {loadingMore ? "Generating…" : "Generate 2 more recipes"}
              </IconLabel>
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
