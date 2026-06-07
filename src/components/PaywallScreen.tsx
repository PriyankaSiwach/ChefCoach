/**
 * Full-screen paywall — shown when a free user attempts their 4th fridge scan.
 *
 * Products (must exist in App Store Connect + RevenueCat dashboard):
 *   com.chefcoach.pro.monthly  — $7.99 / month
 *   com.chefcoach.pro.yearly   — $59.99 / year  (saves 37 %)
 *
 * Purchase flow:
 *   1. User selects Monthly or Yearly
 *   2. Tap "Subscribe" → purchaseProduct() → native Apple IAP sheet
 *   3. On success: Supabase profile_data updated → onPurchaseSuccess() called
 *
 * Restore flow:
 *   Tap "Restore Purchases" → restoreIAPPurchases() → checks entitlements
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  purchaseProduct,
  restoreIAPPurchases,
  fetchOfferingsSafe,
  PRODUCT_MONTHLY,
  PRODUCT_YEARLY,
} from "@/lib/iap";
import { useToast } from "@/components/Toast";
import { APP_NAME } from "@/lib/brand";
import type { UserProfile } from "@/types";
import type { ComponentType } from "react";
import {
  BotIcon,
  CalendarIcon,
  CameraIcon,
  ChartIcon,
  ChefHatIcon,
  HeartIcon,
  StarIcon,
  TrophyIcon,
  UnlockIcon,
} from "@/components/icons/AppIcons";

type FeatureIcon = ComponentType<{ className?: string }>;

type Plan = "monthly" | "yearly";

type Props = {
  open: boolean;
  onClose: () => void;
  onPurchaseSuccess: () => void;
  appUserId: string | null;
  /** Pass current profile so iap.ts can patch it in-place after purchase. */
  currentProfile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
};

const FEATURES: Array<{ Icon: FeatureIcon; text: string }> = [
  { Icon: CameraIcon, text: "Unlimited fridge scans" },
  { Icon: ChefHatIcon, text: "Advanced step-by-step recipes" },
  { Icon: CalendarIcon, text: "Weekly meal planning + grocery list" },
  { Icon: BotIcon, text: "Priority AI ingredient detection" },
  { Icon: ChartIcon, text: "Full nutrition & calorie tracking" },
  { Icon: HeartIcon, text: "Unlimited saved recipes" },
  { Icon: TrophyIcon, text: "Streaks & achievement system" },
];

export function PaywallScreen({
  open,
  onClose,
  onPurchaseSuccess,
  appUserId,
  currentProfile,
  setProfile,
}: Props) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const showToast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setOfferingsLoading(false);
      return;
    }

    let cancelled = false;
    setOfferingsLoading(true);
    void fetchOfferingsSafe(appUserId).then(() => {
      if (cancelled) return;
      setOfferingsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, appUserId]);

  if (!open) return null;

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const productId = selectedPlan === "yearly" ? PRODUCT_YEARLY : PRODUCT_MONTHLY;
      const result = await purchaseProduct(productId, appUserId, currentProfile, setProfile);
      if (result.ok) {
        showToast(`🎉 Welcome to ${APP_NAME} Pro!`, "success");
        onPurchaseSuccess();
      } else if (!result.userCancelled) {
        showToast(result.error, "info");
      }
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Purchase failed. Please try again.",
        "info"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restoreIAPPurchases(appUserId, currentProfile, setProfile);
      if (result.ok) {
        showToast("✅ Purchases restored! You now have Pro access.", "success");
        onPurchaseSuccess();
      } else {
        showToast(result.error, "info");
      }
    } catch {
      showToast("Restore failed. Please try again.", "info");
    } finally {
      setRestoring(false);
    }
  };

  const busy = loading || restoring || offeringsLoading;
  const canPurchase = !offeringsLoading;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[var(--white)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      {/* ── Header ── */}
      <div className="relative bg-gradient-to-br from-[#1a3a06] via-[var(--green)] to-[#5a9e2f] px-6 pb-8 pt-[calc(3rem+env(safe-area-inset-top,0px))] text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 shadow-inner">
          <UnlockIcon className="h-8 w-8 text-white" />
        </div>
        <h1
          id="paywall-title"
          className="font-playfair text-[28px] leading-tight text-white"
        >
          Unlock Unlimited{" "}
          <span className="text-[#A8D46F]">{APP_NAME}</span>
        </h1>
        <p className="mt-2 text-sm text-white/80">
          Upgrade to unlock unlimited scans and cook smarter every day.
        </p>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mb-5 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[var(--border)] bg-[var(--cream)] px-6 py-2.5 text-sm font-medium text-[var(--gray)] shadow-sm transition hover:border-[var(--green)] hover:text-[var(--green)] disabled:opacity-40"
          >
            Maybe later
          </button>
        </div>

        {/* Features list */}
        <ul className="mb-5 space-y-2.5">
          {FEATURES.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--green-pale)] text-[var(--green)]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-medium text-[var(--text)]">{text}</span>
              <span className="ml-auto text-[var(--green)]" aria-hidden>✓</span>
            </li>
          ))}
        </ul>

        {/* Plan selector */}
        <div className="mb-4 grid grid-cols-2 gap-3">

          {/* Yearly — pre-selected, best value */}
          <button
            type="button"
            onClick={() => setSelectedPlan("yearly")}
            aria-pressed={selectedPlan === "yearly"}
            className={`relative flex flex-col items-center rounded-2xl border-2 p-4 transition ${
              selectedPlan === "yearly"
                ? "border-[var(--green)] bg-[var(--green-pale)]"
                : "border-[var(--border)] bg-[var(--gray-light)]/40"
            }`}
          >
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--orange)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Save 37%
            </span>
            <span className={`mt-1 text-xs font-semibold uppercase tracking-wide ${selectedPlan === "yearly" ? "text-[var(--green)]" : "text-[var(--gray)]"}`}>
              Yearly
            </span>
            <span className={`mt-1 text-xl font-bold ${selectedPlan === "yearly" ? "text-[var(--green)]" : "text-[var(--text)]"}`}>
              $59.99
            </span>
            <span className="text-[11px] text-[var(--gray)]">per year · $5.00/mo</span>
            <span className="mt-1 text-[10px] text-[var(--gray)]">
              {PRODUCT_YEARLY}
            </span>
            {selectedPlan === "yearly" && (
              <span className="mt-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--green)] text-[10px] text-white">✓</span>
            )}
          </button>

          {/* Monthly */}
          <button
            type="button"
            onClick={() => setSelectedPlan("monthly")}
            aria-pressed={selectedPlan === "monthly"}
            className={`flex flex-col items-center rounded-2xl border-2 p-4 transition ${
              selectedPlan === "monthly"
                ? "border-[var(--green)] bg-[var(--green-pale)]"
                : "border-[var(--border)] bg-[var(--gray-light)]/40"
            }`}
          >
            <span className={`text-xs font-semibold uppercase tracking-wide ${selectedPlan === "monthly" ? "text-[var(--green)]" : "text-[var(--gray)]"}`}>
              Monthly
            </span>
            <span className={`mt-1 text-xl font-bold ${selectedPlan === "monthly" ? "text-[var(--green)]" : "text-[var(--text)]"}`}>
              $7.99
            </span>
            <span className="text-[11px] text-[var(--gray)]">per month</span>
            <span className="mt-1 text-[10px] text-[var(--gray)]">
              {PRODUCT_MONTHLY}
            </span>
            {selectedPlan === "monthly" && (
              <span className="mt-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--green)] text-[10px] text-white">✓</span>
            )}
          </button>
        </div>

        {/* Subscribe CTA */}
        <button
          type="button"
          onClick={() => void handleSubscribe()}
          disabled={busy || !canPurchase}
          className="w-full rounded-[14px] bg-[var(--green)] py-4 font-playfair text-lg text-white shadow-md transition hover:bg-[var(--green-light)] disabled:opacity-70"
        >
          {loading
            ? "Opening purchase…"
            : !canPurchase
              ? "Purchases unavailable"
              : selectedPlan === "yearly"
                ? "Subscribe — $59.99 / year"
                : "Subscribe — $7.99 / month"}
        </button>

        <p className="mt-2 text-center text-[11px] text-[var(--gray)]">
          Billed via Apple In-App Purchase. Cancel anytime in{" "}
          <span className="font-medium">Settings → Subscriptions</span>.
        </p>

        {/* Restore */}
        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={busy}
          className="mt-3 w-full rounded-[14px] border border-[var(--border)] py-3 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--gray-light)] disabled:opacity-60"
        >
          {restoring ? "Restoring…" : "Restore Purchases"}
        </button>

        {/* Legal */}
        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-[var(--gray)]">
          <button
            type="button"
            onClick={() => navigate("/terms")}
            className="underline underline-offset-2"
          >
            Terms of Service
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => navigate("/privacy")}
            className="underline underline-offset-2"
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
}
