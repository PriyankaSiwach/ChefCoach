import { MacroPills } from "./MacroPills";

type MealPlanItem = {
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  reason: string;
};

type Props = {
  meals: MealPlanItem[];
};

export function DietPlanSection({ meals }: Props) {
  if (!meals.length) return null;

  return (
    <section className="mx-auto max-w-[600px] px-5 pb-8">
      <div className="mb-3">
        <h2 className="font-playfair text-3xl text-[var(--green)]">Diet Plan</h2>
        <p className="mt-1 text-sm text-[var(--gray)]">
          Mock daily meal plan based on your lifestyle profile.
        </p>
      </div>
      <div className="space-y-3">
        {meals.map((meal) => (
          <article
            key={meal.meal}
            className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-playfair text-xl text-[var(--text)]">{meal.meal}</h3>
              <span className="rounded-full bg-[var(--green-pale)] px-3 py-1 text-xs text-[var(--green)]">
                {meal.calories} kcal
              </span>
            </div>
            <p className="text-sm font-medium text-[var(--text)]">{meal.name}</p>
            <MacroPills
              className="mt-2"
              calories={meal.calories}
              protein={meal.protein}
              carbs={meal.carbs}
              fat={meal.fat}
            />
            <p className="mt-3 text-sm text-[var(--gray)]">{meal.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export type { MealPlanItem };
