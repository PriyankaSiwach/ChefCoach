import type { Recipe, UserProfile } from "@/types";
import { RecipeCard } from "./RecipeCard";

const SAMPLE_CARDS = [
  {
    title: "Chicken Stir Fry",
    tint: "from-amber-100/90 to-orange-50/80",
    overlay: "🍳 Breakfast recipes",
  },
  {
    title: "Greek Salad",
    tint: "from-emerald-100/90 to-green-50/80",
    overlay: "🥗 Lunch & salads",
  },
  {
    title: "Pasta Primavera",
    tint: "from-rose-100/90 to-red-50/80",
    overlay: "🍖 Dinner ideas",
  },
] as const;

type Props = {
  favourites: Recipe[];
  onToggleFavourite: (recipe: Recipe) => void;
  profile?: UserProfile | null;
  onGoCook?: () => void;
};

export function FavouritesPanel({ favourites, onToggleFavourite, profile = null, onGoCook }: Props) {
  if (favourites.length === 0) {
    return (
      <div className="mx-auto max-w-[560px] px-6 pb-12">
        <div className="text-center">
          <div className="text-5xl" style={{ animation: "float 3s ease-in-out infinite" }}>
            ❤️
          </div>
          <h2 className="mt-3 font-playfair text-xl text-[var(--green)]">Your recipe collection is empty</h2>
          <p className="mt-2 text-sm text-[var(--gray)]">
            Save dishes from Cook to build your personal cookbook.
          </p>
        </div>
        <div className="mt-8 space-y-4">
          {SAMPLE_CARDS.map(({ title, tint, overlay }) => (
            <div
              key={title}
              className={`relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br ${tint} p-5 shadow-inner`}
            >
              <div className="pointer-events-none blur-[7px] select-none">
                <p className="font-playfair text-lg text-[var(--text)]">{title}</p>
                <p className="mt-2 h-3 w-2/3 rounded bg-[var(--gray)]/20" />
                <p className="mt-2 h-3 w-1/2 rounded bg-[var(--gray)]/15" />
                <div className="mt-4 flex gap-2">
                  <span className="h-6 w-16 rounded-full bg-white/50" />
                  <span className="h-6 w-16 rounded-full bg-white/50" />
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-white/25 px-4 backdrop-blur-[2px]">
                <p className="text-center text-xs font-semibold text-[var(--green)]">
                  {overlay}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <button
            type="button"
            className="text-sm font-semibold text-[var(--green)] underline underline-offset-4"
            onClick={onGoCook}
          >
            Start by scanning your fridge →
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-[560px] px-6 pb-12">
      {favourites.map((recipe) => (
        <RecipeCard
          key={`fav-${recipe.name}`}
          recipe={recipe}
          isSaved
          onToggleFavourite={onToggleFavourite}
          profile={profile}
        />
      ))}
    </section>
  );
}
