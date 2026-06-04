import type { DietFilter } from "@/types";
import { COOK_DIET_FILTER_OPTIONS } from "@/lib/dietConstants";

type Props = {
  selectedDiet: DietFilter;
  onDietChange: (diet: DietFilter) => void;
};

export function DietaryPreferencesSection({ selectedDiet, onDietChange }: Props) {
  return (
    <section className="mx-auto max-w-[600px] px-5 pb-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gray)]">
        Dietary preference
      </h3>
      <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-2">
        {COOK_DIET_FILTER_OPTIONS.map((d) => (
          <button
            key={d.value}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs ${
              selectedDiet === d.value
                ? "border-[var(--green)] bg-[var(--green)] text-white"
                : "border-[var(--border)] bg-[var(--white)] text-[var(--gray)]"
            }`}
            onClick={() => onDietChange(d.value)}
          >
            {d.label}
          </button>
        ))}
      </div>
    </section>
  );
}
