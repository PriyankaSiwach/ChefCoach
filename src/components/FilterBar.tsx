import type { DietFilter, TimeFilter } from "@/types";
import { COOK_DIET_FILTER_OPTIONS } from "@/lib/dietConstants";
import { ClockIcon, DietFilterIcon, IconLabel } from "@/components/icons/AppIcons";

type Props = {
  selectedDiet: DietFilter;
  selectedTime: TimeFilter;
  onDietChange: (diet: DietFilter) => void;
  onTimeChange: (time: TimeFilter) => void;
};

const times: Array<{ label: string; value: TimeFilter; showClock?: boolean }> = [
  { label: "Any time", value: "any", showClock: true },
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
            <IconLabel icon={<DietFilterIcon value={d.value} />}>{d.label}</IconLabel>
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
            {t.showClock ? (
              <IconLabel icon={<ClockIcon />}>{t.label}</IconLabel>
            ) : (
              t.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
