import { LockIcon } from "@/components/icons/AppIcons";

type Props = {
  onUpgrade: () => void;
};

export function TrialEndedBanner({ onUpgrade }: Props) {
  return (
    <div
      className="sticky top-0 z-30 border-b border-white/10 px-4 py-3"
      style={{
        backgroundColor: "rgba(26, 58, 10, 0.95)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="mx-auto flex max-w-[600px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--orange)]" aria-hidden>
            <LockIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-white">Your free trial has ended</p>
            <p className="mt-0.5 text-[13px] text-[var(--cream)]/70">
              Upgrade to see your recipes + unlock everything
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 rounded-full border-2 border-[var(--cream)]/80 bg-[var(--cream)] px-5 py-2.5 text-sm font-semibold text-[var(--green)] shadow-md transition hover:bg-white"
        >
          Unlock unlimited
        </button>
      </div>
    </div>
  );
}
