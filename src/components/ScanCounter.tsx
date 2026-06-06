/**
 * "X of 3 free scans used" pill shown on the Cook tab home screen.
 * Re-renders whenever `tick` changes (pass `scanCountTick` from RecipifyApp).
 * Hidden for Pro users and users with the dev bypass.
 */
import { FREE_SCAN_LIMIT, getScansUsed } from "@/lib/trial";

type Props = {
  /** Increment this to force a re-read of localStorage. */
  tick: number;
  onUpgrade: () => void;
};

export function ScanCounter({ tick: _tick, onUpgrade }: Props) {
  const used = getScansUsed();
  const exhausted = used >= FREE_SCAN_LIMIT;

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--white)] px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 gap-1">
          {Array.from({ length: FREE_SCAN_LIMIT }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i < used
                  ? exhausted
                    ? "bg-red-400"
                    : "bg-[var(--orange)]"
                  : "bg-[var(--border)]"
              }`}
              aria-hidden
            />
          ))}
        </div>
        <span
          className={`truncate text-[11px] font-medium ${
            exhausted ? "text-red-600" : "text-[var(--gray)]"
          }`}
        >
          {exhausted
            ? "Free scans used"
            : `${used}/${FREE_SCAN_LIMIT} free scans`}
        </span>
      </div>

      <button
        type="button"
        onClick={onUpgrade}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
          exhausted
            ? "bg-[var(--green)] text-white hover:bg-[var(--green-light)]"
            : "border border-[var(--green)]/20 bg-[var(--green-pale)] text-[var(--green)] hover:bg-[var(--green)] hover:text-white"
        }`}
      >
        {exhausted ? "Upgrade" : "Go Pro"}
      </button>
    </div>
  );
}
