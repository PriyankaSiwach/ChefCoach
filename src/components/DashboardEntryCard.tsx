import { useEffect, useMemo, useState } from "react";
import type { UserProfile } from "@/types";
import {
  formatLocalDate,
  getStreakDisplay,
  readDailyLog,
} from "@/lib/gamification";

const activityMult: Record<UserProfile["activityLevel"], number> = {
  sedentary: 1.2,
  light: 1.375,
  gym_regular: 1.55,
  athlete: 1.725,
};

function computeDailyCalorieTarget(profile: UserProfile): number {
  const bmr =
    profile.sex === "male"
      ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
      : profile.sex === "female"
        ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161
        : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;

  let calories = Math.round(bmr * activityMult[profile.activityLevel]);
  if (profile.goal === "lose_weight") calories -= 300;
  if (profile.goal === "build_muscle") calories += 300;
  return calories;
}

type Props = {
  profile: UserProfile;
  onOpen: () => void;
};

export function DashboardEntryCard({ profile, onOpen }: Props) {
  const todayStr = formatLocalDate(new Date());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("meal-logged", bump);
    window.addEventListener("recipify-stats-changed", bump);
    return () => {
      window.removeEventListener("meal-logged", bump);
      window.removeEventListener("recipify-stats-changed", bump);
    };
  }, []);

  const target = useMemo(() => computeDailyCalorieTarget(profile), [profile]);
  const log = useMemo(() => readDailyLog(todayStr), [todayStr, tick]);
  const streak = useMemo(() => getStreakDisplay(), [tick]);

  const progress = target > 0 ? Math.min(1, log.calories / target) : 0;
  const mealsLogged = log.entries.length;
  const kcalRemaining = Math.max(0, target - log.calories);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--white)] text-left shadow-[0_4px_24px_rgba(45,80,22,0.07)] transition hover:border-[var(--green)]/25 hover:shadow-[0_8px_32px_rgba(45,80,22,0.12)] active:scale-[0.99]"
    >
      <div className="bg-gradient-to-br from-[var(--green-pale)]/80 via-[var(--white)] to-[var(--white)] px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--green)] to-[var(--green-light)] text-white shadow-[0_4px_12px_rgba(45,80,22,0.25)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 19V5a1 1 0 011-1h5l2 2h7a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d="M8 11h8M8 15h5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="block font-playfair text-[17px] leading-tight text-[var(--green)]">
              Wellness Dashboard
            </span>
            <span className="mt-1 block text-[12px] leading-snug text-[var(--gray)]">
              Macros, meals, water & streak
            </span>
          </span>
          <span
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--green-pale)] text-[var(--green)] transition group-hover:bg-[var(--green)] group-hover:text-white"
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18l6-6-6-6"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>

      <div className="border-t border-[var(--border)]/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-[var(--gray)]">
          <span className="inline-flex items-center gap-1.5">
            {streak.count > 0 ? (
              <>
                <span className="text-[var(--orange)]">🔥</span>
                <span className="text-[var(--text)]">{streak.count}-day streak</span>
              </>
            ) : (
              <span>Start your streak today</span>
            )}
          </span>
          <span className="tabular-nums text-[var(--text)]">
            {log.calories.toLocaleString()} / {target.toLocaleString()} kcal
          </span>
        </div>
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--gray-light)]"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Daily calorie progress"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--green)] to-[var(--green-light)] transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-[var(--gray)]">
          {mealsLogged > 0 ? (
            <>
              {mealsLogged} meal{mealsLogged === 1 ? "" : "s"} logged
              {kcalRemaining > 0 ? ` · ${kcalRemaining.toLocaleString()} kcal left` : " · goal reached"}
            </>
          ) : (
            <>Tap to log meals, track water & view today&apos;s plan</>
          )}
        </p>
      </div>
    </button>
  );
}
