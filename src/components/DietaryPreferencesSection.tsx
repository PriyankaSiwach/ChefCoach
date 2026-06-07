import type { DietFilter } from "@/types";
import { COOK_DIET_FILTER_OPTIONS } from "@/lib/dietConstants";
import { DietFilterIcon, IconLabel } from "@/components/icons/AppIcons";

type Props = {
  selectedDiet: DietFilter;
  onDietChange: (diet: DietFilter) => void;
};

export function DietaryPreferencesSection({ selectedDiet, onDietChange }: Props) {
  return (
    <section className="mx-auto max-w-[430px] px-4 pb-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">
        Step 2 · Preferences
      </p>
      <h3 className="mb-2.5 text-[13px] font-semibold text-[var(--text)]">Dietary preference</h3>
      <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-2">
        {COOK_DIET_FILTER_OPTIONS.map((d) => {
          const active = selectedDiet === d.value;
          return (
            <button
              key={d.value}
              type="button"
              className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-xs ${
                active
                  ? "border-[var(--green)] bg-[var(--green)] text-white"
                  : "border-[var(--border)] bg-[var(--white)] text-[var(--gray)]"
              }`}
              onClick={() => onDietChange(d.value)}
            >
              <IconLabel icon={<DietFilterIcon value={d.value} className="h-4 w-4" />}>
                {d.label}
              </IconLabel>
            </button>
          );
        })}
      </div>
    </section>
  );
}
