import type { DietFilter, TimeFilter } from "@/types";

type Props = {
  selectedDiet: DietFilter;
  selectedTime: TimeFilter;
  onDietChange: (diet: DietFilter) => void;
  onTimeChange: (time: TimeFilter) => void;
};

const diets: Array<{ label: string; value: DietFilter }> = [
  { label: "🍽️ No filter", value: "None" },
  { label: "🌿 Vegetarian", value: "Vegetarian" },
  { label: "🥦 Vegan", value: "Vegan" },
  { label: "🥩 Keto", value: "Keto" },
  { label: "🌾 Gluten-free", value: "Gluten-free" },
];

const times: Array<{ label: string; value: TimeFilter }> = [
  { label: "⏱ Any time", value: "any" },
  { label: "Under 15 min", value: "15" },
  { label: "Under 30 min", value: "30" },
  { label: "Under 1 hour", value: "60" },
];

export function FilterBar({
  selectedDiet,
  selectedTime,
  onDietChange,
  onTimeChange,
}: Props) {
  return (
    <div className="mx-auto max-w-[600px] px-6 pb-5">
      <div className="mb-2 mt-3 text-xs font-medium uppercase tracking-wider text-[var(--gray)]">
        Dietary preference
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {diets.map((d) => (
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
      <div className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-[var(--gray)]">
        Max cook time
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {times.map((t) => (
          <button
            key={t.value}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs ${
              selectedTime === t.value
                ? "border-[var(--orange)] bg-[var(--orange)] text-white"
                : "border-[var(--border)] bg-[var(--white)] text-[var(--gray)]"
            }`}
            onClick={() => onTimeChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
