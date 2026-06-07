import type { TimeFilter } from "@/types";
import { ClockIcon, IconLabel } from "@/components/icons/AppIcons";

const times: Array<{ label: string; value: TimeFilter }> = [
  { label: "Any time", value: "any" },
  { label: "Under 15 min", value: "15" },
  { label: "Under 30 min", value: "30" },
  { label: "Under 1 hour", value: "60" },
];

type Props = {
  selectedTime: TimeFilter;
  onTimeChange: (time: TimeFilter) => void;
};

export function CookTimeFilterSection({ selectedTime, onTimeChange }: Props) {
  return (
    <section className="mx-auto max-w-[430px] px-4 pb-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-[var(--text)]">Max cook time</h3>
      <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-2">
        {times.map((t) => {
          const active = selectedTime === t.value;
          return (
            <button
              key={t.value}
              type="button"
              className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-xs ${
                active
                  ? "border-[var(--orange)] bg-[var(--orange)] text-white"
                  : "border-[var(--border)] bg-[var(--white)] text-[var(--gray)]"
              }`}
              onClick={() => onTimeChange(t.value)}
            >
              <IconLabel icon={<ClockIcon className="h-4 w-4" />}>{t.label}</IconLabel>
            </button>
          );
        })}
      </div>
    </section>
  );
}
