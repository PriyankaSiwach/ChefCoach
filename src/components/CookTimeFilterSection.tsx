import type { TimeFilter } from "@/types";

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
    <section className="mx-auto max-w-[600px] px-5 pb-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gray)]">
        Max cook time
      </h3>
      <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-2">
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
    </section>
  );
}
