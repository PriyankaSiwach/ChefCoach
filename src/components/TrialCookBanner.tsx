
import { AlertIcon, IconLabel, StarIcon } from "@/components/icons/AppIcons";

type Props = {
  scansRemaining: number;
  trialEnded: boolean;
  onUpgrade: () => void;
};

export function TrialCookBanner({ scansRemaining, trialEnded, onUpgrade }: Props) {
  if (trialEnded || scansRemaining <= 0) return null;

  const used = 3 - scansRemaining;
  const isLast = scansRemaining === 1;

  return (
    <div
      className={`mx-auto w-full max-w-[600px] px-5 pb-3 pt-2 ${
        isLast ? "bg-[var(--orange-pale)]" : "bg-[var(--cream)]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${isLast ? "text-[var(--orange)]" : "text-[var(--green)]"}`}>
            {isLast ? (
              <IconLabel icon={<AlertIcon className="h-4 w-4" />}>Last free scan! Make it count.</IconLabel>
            ) : (
              <IconLabel icon={<StarIcon className="h-4 w-4" />}>
                Free trial: {scansRemaining} scan{scansRemaining === 1 ? "" : "s"} remaining
              </IconLabel>
            )}
          </span>
          <span className="flex gap-1 text-[var(--gray)]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < used ? "text-[var(--green)]" : "text-[var(--gray-light)]"}>
                ●
              </span>
            ))}
          </span>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-3.5 py-2 text-xs font-semibold text-[var(--green)] shadow-sm transition hover:bg-[var(--green)] hover:text-white"
        >
          Unlock unlimited scans
        </button>
      </div>
    </div>
  );
}
