import type { Recipe, UserProfile } from "@/types";
import { FavouritesPanel } from "./FavouritesPanel";

type Props = {
  favourites: Recipe[];
  onToggleFavourite: (recipe: Recipe) => void;
  profile?: UserProfile | null;
  onGoCook?: () => void;
};

export function SavedRecipesSection({
  favourites,
  onToggleFavourite,
  profile = null,
  onGoCook,
}: Props) {
  return (
    <main>
      <section className="mx-auto max-w-[600px] px-5 pb-4 pt-8 text-center md:pt-10">
        <h1 className="font-playfair text-3xl text-[var(--green)]">Saved Recipes</h1>
        <p className="mt-2 text-sm text-[var(--gray)]">
          Your favourite meals, ready whenever you need them.
        </p>
      </section>
      <FavouritesPanel
        favourites={favourites}
        onToggleFavourite={onToggleFavourite}
        profile={profile}
        onGoCook={onGoCook}
      />
    </main>
  );
}
