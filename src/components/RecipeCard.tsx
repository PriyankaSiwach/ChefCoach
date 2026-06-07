
import { useState } from "react";
import { appendRecipeToDailyLog } from "@/lib/gamification";
import { useCountUp } from "@/hooks/useCountUp";
import { ChartIcon, ClockIcon, HeartIcon, IconLabel } from "@/components/icons/AppIcons";
import { MacroPills } from "./MacroPills";
import type { Recipe, UserProfile } from "@/types";
import { useToast } from "./Toast";

type Props = {
  recipe: Recipe;
  isSaved: boolean;
  onToggleFavourite: (recipe: Recipe) => void;
  profile?: UserProfile | null;
  index?: number;
};

export function RecipeCard({ recipe, isSaved, onToggleFavourite, profile = null, index = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();
  const calories = useCountUp(recipe.calories, 800);
  const protein = useCountUp(recipe.protein_g, 800);
  const carbs = useCountUp(recipe.carbs_g, 800);
  const fat = useCountUp(recipe.fat_g, 800);

  return (
    <article
      className="mb-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--white)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.08)]"
      style={{ animation: "fadeInUp 0.4s ease both", animationDelay: `${index * 0.15}s` }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex-1">
          <h3 className="font-playfair text-[20px] leading-tight">{recipe.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-[var(--orange)]">
              <IconLabel icon={<ClockIcon />}>{recipe.cookTime}</IconLabel>
            </span>
            {recipe.diet ? (
              <span className="rounded-full bg-[var(--green-pale)] px-2 py-1 font-medium text-[var(--green)]">
                {recipe.diet}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              appendRecipeToDailyLog(recipe, profile);
              showToast("Meal logged!", "success");
            }}
            className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-[var(--green)]"
            title="Log meal to today"
          >
            <IconLabel icon={<ChartIcon className="h-3.5 w-3.5" />}>Log Meal</IconLabel>
          </button>
          <button
            type="button"
            onClick={() => onToggleFavourite(recipe)}
            className={`flex items-center justify-center rounded-lg border px-2 py-2 transition ${
              isSaved
                ? "border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)]"
                : "border-[var(--border)] bg-[var(--white)] text-[var(--gray)]"
            }`}
            title={isSaved ? "Unsave recipe" : "Save recipe"}
            aria-pressed={isSaved}
          >
            <HeartIcon filled={isSaved} className="h-5 w-5" />
          </button>
        </div>
      </div>

      <p className="border-b border-[var(--gray-light)] px-5 pb-3 text-sm leading-6 text-[var(--gray)]">
        {recipe.description}
      </p>

      <MacroPills
        className="px-5 pb-2 pt-3"
        calories={calories}
        protein={protein}
        carbs={carbs}
        fat={fat}
      />
      <div className="mx-5 border-t border-[var(--gray-light)]" />

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-[var(--green)] hover:bg-[var(--gray-light)]"
      >
        <span>{open ? "Hide steps" : "View steps"}</span>
        <span>{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className="px-5 pb-4">
          {recipe.steps.map((step, index) => (
            <div key={`${recipe.name}-${index}`} className="mb-3 flex gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-xs text-white">
                {index + 1}
              </div>
              <p className="text-sm leading-6">{step}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
