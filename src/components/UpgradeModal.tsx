
import { useState } from "react";
import { presentRevenueCatPaywall } from "@/lib/revenueCat";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Supabase user id — forwarded to RevenueCat as `appUserID`. */
  appUserId: string | null;
};

export function UpgradeModal({ open, onClose, appUserId }: Props) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      const result = await presentRevenueCatPaywall(appUserId);
      if (!result.ok) {
        if (!result.userCancelled) {
          alert(result.error);
        }
        return;
      }
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Purchase could not be completed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemindTomorrow = () => {
    if (typeof window !== "undefined") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      window.localStorage.setItem("recipify_remind_tomorrow", tomorrow.toISOString().slice(0, 10));
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="upgrade-modal-enter relative z-10 max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-[var(--white)] shadow-2xl sm:rounded-3xl">
        <div className="rounded-t-3xl bg-gradient-to-br from-[var(--green)] to-[var(--green-light)] px-6 py-6 text-center">
          <h2 id="upgrade-modal-title" className="font-playfair text-2xl text-[var(--cream)]">
            You've used your 3 free scans
          </h2>
          <p className="mt-2 text-sm text-white/90">
            Upgrade to keep scanning and unlock everything — billed through the App Store (RevenueCat).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--gray-light)]/50 p-4">
            <p className="font-playfair text-lg text-[var(--text)]">Free</p>
            <ul className="mt-3 space-y-2 text-xs text-[var(--gray)]">
              <li className="flex gap-2">
                <span className="text-black" aria-hidden>
                  ○
                </span>{" "}
                Recipes lock after free scans
              </li>
              <li className="flex gap-2">
                <span className="text-black" aria-hidden>
                  ○
                </span>{" "}
                Coach & planner paused
              </li>
              <li className="flex gap-2">
                <span className="text-black" aria-hidden>
                  ○
                </span>{" "}
                Saved list read-only
              </li>
            </ul>
          </div>

          <div className="relative rounded-2xl border-2 border-[var(--green)] bg-[var(--green-pale)]/80 p-4">
            <span className="absolute -right-1 -top-2 rounded-full bg-[var(--orange)] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Most popular
            </span>
            <p className="font-playfair text-lg text-[var(--green)]">Pro</p>
            <p className="text-sm font-semibold text-[var(--text)]">Via Apple In-App Purchase</p>
            <ul className="mt-3 space-y-2 text-xs text-[var(--text)]">
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Unlimited fridge scans
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Full recipes + step-by-step
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Complete macro & calorie data
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Personal diet coach chat
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Weekly meal plan, pantry &amp; grocery list
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Streak & achievement tracking
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--green)]">✓</span> Unlimited saved recipes
              </li>
            </ul>
          </div>
        </div>

        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => void handleUpgrade()}
            disabled={loading}
            className="w-full rounded-[14px] bg-[var(--green)] py-4 font-playfair text-lg text-white transition hover:bg-[var(--green-light)] disabled:opacity-70"
          >
            {loading ? "Opening paywall…" : "Subscribe with Apple 🍎"}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--gray)]">
            On iPhone or iPad, confirm with Face ID, Touch ID, or your Apple ID. Manage or cancel in Settings →
            Subscriptions.
          </p>
          <p className="mt-2 text-center text-[11px] text-[var(--gray)]">
            Powered by RevenueCat • Apple In-App Purchase
          </p>
          <button
            type="button"
            onClick={handleRemindTomorrow}
            className="mt-3 w-full text-center text-[11px] text-[var(--gray)] underline underline-offset-2"
          >
            Remind me tomorrow
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-[var(--border)] px-5 py-4">
          <div className="flex -space-x-2">
            <span className="relative z-[3] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#6b8f4e] text-xs font-semibold text-[var(--cream)]">
              S
            </span>
            <span className="relative z-[2] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#8b7355] text-xs font-semibold text-[var(--cream)]">
              M
            </span>
            <span className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#5a7a8c] text-xs font-semibold text-[var(--cream)]">
              J
            </span>
          </div>
          <p className="text-left text-[13px] text-[var(--gray)]">Join 2,400+ people eating smarter</p>
        </div>
      </div>
    </div>
  );
}
