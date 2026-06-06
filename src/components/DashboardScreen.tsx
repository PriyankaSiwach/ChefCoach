
import { useEffect, useMemo, useState } from "react";
import {
  appendManualMealToDailyLog,
  formatLocalDate,
  getStreakDisplay,
  getWeekRangeContaining,
  readDailyLog,
  removeLoggedMealEntry,
  WEEKDAY_LABELS,
  dayHasMealLog,
  type LoggedMealEntry,
} from "@/lib/gamification";
import { getSafeMeals, getHeroIngredient, getDailyMeal } from "@/lib/mealFilter";
import type { Meal } from "@/lib/mealLibrary";
import type { UserProfile } from "@/types";
import { useToast } from "./Toast";

/** Stable day-of-year seed so the same meals show all day, different tomorrow. */
function todayDayIndex(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function pickDifferentMeal(
  type: "breakfast" | "lunch" | "dinner",
  profile: import("@/types").UserProfile,
  exclude: string[]
): Meal {
  const pool = getSafeMeals(profile, type).filter((m) => !exclude.includes(m.name));
  if (pool.length === 0) return getSafeMeals(profile, type)[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Meal card for "Today's meal plan" ─────────────────────────────────────
function TodayMealCard({
  meal,
  mealType,
  userAllergens,
  onReplace,
}: {
  meal: Meal;
  mealType: "Breakfast" | "Lunch" | "Dinner";
  userAllergens: string[];
  onReplace: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hero = getHeroIngredient(meal);
  const flagged = meal.allergens.some((a) =>
    userAllergens.map((u) => u.toLowerCase()).includes(a.toLowerCase())
  );

  const MEAL_EMOJI: Record<string, string> = {
    Breakfast: "🌅",
    Lunch: "☀️",
    Dinner: "🌙",
  };

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--white)] overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gray)]">
            {MEAL_EMOJI[mealType]} {mealType}
          </p>
          <p className="mt-0.5 truncate font-playfair text-lg text-[var(--text)]">{meal.name}</p>
          <p className="mt-0.5 text-[11px] text-[var(--gray)]">
            {meal.calories} cal · <span className="text-[var(--green)] font-medium">{meal.protein_g}g protein</span> · {meal.carbs_g}g carbs · {meal.fat_g}g fat
          </p>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReplace}
            title="Try another meal"
            className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--gray)] hover:border-[var(--green)] hover:text-[var(--green)]"
          >
            🔄
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-2.5 py-1 text-[11px] font-semibold text-[var(--green)]"
          >
            📋 {expanded ? "Hide" : "Steps"} {expanded ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded ? (
        <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
          {/* Hero + tags */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="flex items-center gap-1 rounded-full bg-[var(--green)] px-3 py-1 text-[11px] font-semibold text-white">
              🥩 {hero}
            </span>
            {meal.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[var(--green-pale)] px-2 py-0.5 text-[10px] font-semibold text-[var(--green)]"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Macro row */}
          <div className="mb-3 grid grid-cols-4 gap-2 rounded-2xl bg-[var(--cream)] p-3">
            <div className="text-center">
              <p className="text-base font-bold text-[var(--text)]">{meal.calories}</p>
              <p className="text-[10px] text-[var(--gray)]">🔥 kcal</p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-[var(--green)]">{meal.protein_g}g</p>
              <p className="text-[10px] text-[var(--gray)]">💪 protein</p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-[var(--text)]">{meal.carbs_g}g</p>
              <p className="text-[10px] text-[var(--gray)]">🍞 carbs</p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-[var(--text)]">{meal.fat_g}g</p>
              <p className="text-[10px] text-[var(--gray)]">🥑 fat</p>
            </div>
          </div>

          {/* Allergen */}
          {meal.allergens.length > 0 ? (
            <div
              className={`mb-3 rounded-xl px-3 py-2 text-[11px] font-medium ${
                flagged ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              ⚠️ Contains: {meal.allergens.join(", ")} — check labels before cooking
              {flagged && (
                <div className="mt-0.5 font-semibold text-red-700">
                  This dish may not be safe for your dietary profile
                </div>
              )}
            </div>
          ) : null}

          {/* Description */}
          <p className="mb-3 text-xs text-[var(--gray)]">{meal.description}</p>

          {/* Steps */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray)]">
            How to make it
          </p>
          <ol className="space-y-2.5">
            {meal.steps.map((step, idx) => (
              <li key={idx} className="flex gap-2.5 text-sm text-[var(--text)]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-[10px] font-bold text-white">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

const DAILY_QUOTES = [
  "You don't have to eat less. You just have to eat right.",
  "Every meal is a chance to nourish yourself.",
  "Progress over perfection — always.",
  "Small consistent choices create big results.",
  "Your body is your most important investment.",
  "Fuel your goals, not just your hunger.",
  "One good meal at a time. That's all it takes.",
] as const;

const RING_R = 38;
const RING_C = 2 * Math.PI * RING_R;

const activityMult: Record<UserProfile["activityLevel"], number> = {
  sedentary: 1.2,
  light: 1.375,
  gym_regular: 1.55,
  athlete: 1.725,
};

function capitalizeName(raw: string): string {
  const t = raw.trim();
  if (!t) return "there";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function waterMotivation(filledCount: number): string {
  if (filledCount <= 2) return "Stay hydrated! Start drinking 💧";
  if (filledCount <= 5) return "Good progress! Keep going 👍";
  if (filledCount <= 7) return "Almost there! One more 💪";
  return "Hydration goal hit! 🎉";
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

type MacroRingProps = {
  label: string;
  unit: string;
  target: number;
  logged: number;
  trackColor: string;
  fillColor: string;
  animationKey: number;
  delayMs?: number;
  showPlusInCenter: boolean;
};

function MacroRing({
  label,
  unit,
  target,
  logged,
  trackColor,
  fillColor,
  animationKey,
  delayMs = 0,
  showPlusInCenter,
}: MacroRingProps) {
  const pct = target > 0 ? Math.min(1, logged / target) : 0;
  const offsetGoal = RING_C * (1 - pct);

  const [strokeOffset, setStrokeOffset] = useState(RING_C);

  useEffect(() => {
    setStrokeOffset(RING_C);
    let frameId: number | null = null;
    let startTs = 0;
    const duration = 1200;
    const easeOut = (t: number) => 1 - (1 - t) ** 3;

    const timeoutId = window.setTimeout(() => {
      const animate = (ts: number) => {
        if (!startTs) startTs = ts;
        const elapsed = ts - startTs;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeOut(progress);
        setStrokeOffset(RING_C + (offsetGoal - RING_C) * eased);
        if (progress < 1) frameId = requestAnimationFrame(animate);
      };
      frameId = requestAnimationFrame(animate);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [animationKey, offsetGoal, delayMs]);

  const centerDisplay =
    showPlusInCenter && logged <= 0 ? (
      <span className="font-playfair text-2xl font-semibold text-[var(--text)]">+</span>
    ) : (
      <span className="font-playfair text-xl font-semibold tabular-nums text-[var(--text)]">
        {unit === "kcal" ? Math.round(logged).toLocaleString() : Math.round(logged).toString()}
      </span>
    );

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[104px] w-[104px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 88 88" aria-hidden>
          <circle cx="44" cy="44" r={RING_R} fill="none" strokeWidth="9" stroke={trackColor} />
          <circle
            cx="44"
            cy="44"
            r={RING_R}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="macro-ring-arc drop-shadow-sm"
            stroke={fillColor}
            strokeDasharray={RING_C}
            strokeDashoffset={strokeOffset}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{centerDisplay}</div>
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--gray)]">
        {label}
      </p>
      <p className="mt-0.5 text-center text-xs tabular-nums text-[var(--text)]">
        / {unit === "kcal" ? `${Math.round(target).toLocaleString()} kcal` : `${Math.round(target)} ${unit}`}
      </p>
    </div>
  );
}

function LoggedMealRow({
  entry,
  onRemove,
}: {
  entry: LoggedMealEntry;
  onRemove: () => void;
}) {
  const time = new Date(entry.loggedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--white)] px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--text)]">{entry.name}</p>
        <p className="mt-0.5 text-xs text-[var(--gray)]">
          {time} · {Math.round(entry.calories)} kcal
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--green-pale)] px-2 py-0.5 text-[11px] font-medium text-[var(--green)]">
            P {Math.round(entry.protein_g)}g
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            C {Math.round(entry.carbs_g)}g
          </span>
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-900">
            F {Math.round(entry.fat_g)}g
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-lg p-2 text-[var(--gray)] hover:bg-[var(--gray-light)] hover:text-red-600"
        aria-label={`Remove ${entry.name} from log`}
        title="Remove from log"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
        </svg>
      </button>
    </li>
  );
}

type DashboardProps = {
  open: boolean;
  profile: UserProfile;
  onClose: () => void;
  onGoCook?: () => void;
  /** Label for the iOS-style back button (e.g. "Cook"). */
  backLabel?: string;
};

export function DashboardScreen({
  open,
  profile,
  onClose,
  onGoCook,
  backLabel = "Cook",
}: DashboardProps) {
  const showToast = useToast();
  const [present, setPresent] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setPresent(false), 320);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!present) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [present]);

  useEffect(() => {
    if (!open) setManualModalOpen(false);
  }, [open]);

  // Auto-assign today's meals on mount — deterministic per day, different tomorrow
  const dayIdx = todayDayIndex();
  const [todayMeals, setTodayMeals] = useState<Record<"Breakfast" | "Lunch" | "Dinner", Meal>>(
    () => ({
      Breakfast: getDailyMeal("breakfast", dayIdx, profile),
      Lunch: getDailyMeal("lunch", dayIdx, profile),
      Dinner: getDailyMeal("dinner", dayIdx, profile),
    })
  );

  const replaceMeal = (type: "Breakfast" | "Lunch" | "Dinner") => {
    const slot = type.toLowerCase() as "breakfast" | "lunch" | "dinner";
    const exclude = Object.values(todayMeals).map((m) => m.name);
    setTodayMeals((prev) => ({
      ...prev,
      [type]: pickDifferentMeal(slot, profile, exclude),
    }));
  };
  const waterKey = useMemo(
    () => `recipify_water_${new Date().toISOString().slice(0, 10)}`,
    []
  );
  const [water, setWater] = useState<boolean[]>(() => Array(8).fill(false));
  const [waterTapBurst, setWaterTapBurst] = useState<Record<number, number>>({});
  const [waterDropBurst, setWaterDropBurst] = useState<Record<number, number>>({});
  const [waterCelebrate, setWaterCelebrate] = useState(false);

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualP, setManualP] = useState("");
  const [manualC, setManualC] = useState("");
  const [manualF, setManualF] = useState("");

  const dailyQuote = DAILY_QUOTES[new Date().getDay() % DAILY_QUOTES.length];

  const plan = useMemo(() => {
    const bmr =
      profile.sex === "male"
        ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
        : profile.sex === "female"
          ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161
          : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;

    let calories = Math.round(bmr * activityMult[profile.activityLevel]);
    if (profile.goal === "lose_weight") calories -= 300;
    if (profile.goal === "build_muscle") calories += 300;

    let split = { p: 0.25, c: 0.5, f: 0.25 };
    if (profile.goal === "lose_weight") split = { p: 0.35, c: 0.35, f: 0.3 };
    if (profile.goal === "build_muscle") split = { p: 0.3, c: 0.45, f: 0.25 };

    return {
      tdee: calories,
      protein: Math.round((calories * split.p) / 4),
      carbs: Math.round((calories * split.c) / 4),
      fat: Math.round((calories * split.f) / 9),
    };
  }, [profile]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = capitalizeName(profile.name || "");
  const goalLabel =
    profile.goal === "build_muscle"
      ? "Build muscle"
      : profile.goal === "lose_weight"
        ? "Lose weight"
        : "Maintain";
  const activityLabel =
    profile.activityLevel === "sedentary"
      ? "Mostly sitting"
      : profile.activityLevel === "light"
        ? "Lightly active"
        : profile.activityLevel === "gym_regular"
          ? "Gym regular"
          : "Very active";
  const filledGlasses = water.filter(Boolean).length;

  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    const bump = () => setProgressTick((t) => t + 1);
    window.addEventListener("recipify-stats-changed", bump);
    window.addEventListener("meal-logged", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("recipify-stats-changed", bump);
      window.removeEventListener("meal-logged", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const streak = useMemo(() => getStreakDisplay(), [progressTick]);
  const weekDates = useMemo(() => getWeekRangeContaining(new Date()), [progressTick]);
  const todayStr = formatLocalDate(new Date());
  const dailyLog = useMemo(() => readDailyLog(todayStr), [progressTick, todayStr]);

  const { calories: lc, protein: lp, carbs: lcarbs, fat: lf, entries } = dailyLog;
  const noMealsYet =
    lc <= 0 && lp <= 0 && lcarbs <= 0 && lf <= 0 && entries.length === 0;

  const kcalRemaining = plan.tdee - lc;
  const proteinGap = plan.protein - lp;
  const overCalories = kcalRemaining < 0;

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(waterKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as boolean[];
      if (Array.isArray(parsed) && parsed.length === 8) {
        setWater(parsed.map(Boolean));
      }
    } catch {
      // ignore read errors
    }
  }, [waterKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(waterKey, JSON.stringify(water));
    } catch {
      // ignore write errors
    }
    window.dispatchEvent(new Event("recipify-water-changed"));
  }, [water, waterKey]);

  useEffect(() => {
    if (filledGlasses === 8) {
      setWaterCelebrate(true);
      showToast("💧 Hydration goal reached! Great job!", "success");
      const id = window.setTimeout(() => setWaterCelebrate(false), 1200);
      return () => window.clearTimeout(id);
    }
    return;
  }, [filledGlasses, showToast]);

  const goCook = () => {
    onClose();
    onGoCook?.();
  };

  const saveManualMeal = () => {
    const cal = Number(manualCalories) || 0;
    const p = Number(manualP) || 0;
    const c = Number(manualC) || 0;
    const f = Number(manualF) || 0;
    appendManualMealToDailyLog(
      todayStr,
      { name: manualName.trim() || "Meal", calories: cal, protein_g: p, carbs_g: c, fat_g: f },
      profile
    );
    setManualModalOpen(false);
    setManualName("");
    setManualCalories("");
    setManualP("");
    setManualC("");
    setManualF("");
    setProgressTick((t) => t + 1);
  };

  return (
    <>
    {present ? (
    <div
      className={`fixed inset-0 z-[56] overflow-hidden transition-[visibility] duration-300 ${
        entered ? "visible" : "invisible"
      }`}
      aria-hidden={!open && !entered}
    >
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full max-w-[430px] flex-col bg-[var(--cream)] shadow-[-12px_0_40px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--cream)]/95 px-3 py-2 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[44px] min-w-[44px] items-center gap-0.5 rounded-lg pl-1 pr-2 text-sm font-medium text-[var(--green)] active:opacity-60"
          aria-label={`Back to ${backLabel}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {backLabel}
        </button>
        <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-playfair text-lg text-[var(--green)]">
          Dashboard
        </p>
        <span className="w-[72px]" aria-hidden />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <main className="mx-auto w-full max-w-[430px] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-2">
      <section className="w-full">
        <div className="relative rounded-3xl bg-gradient-to-r from-[var(--green)] to-[var(--green-light)] p-5 text-[var(--cream)]">
          <div className="flex flex-wrap items-center justify-between gap-3 ">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {profile.avatarDataUri ? (
                <img
                  src={profile.avatarDataUri}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full border-2 border-white/40 object-cover shadow-md"
                />
              ) : null}
              <div className="min-w-0">
                <h1 className="font-playfair text-2xl">
                  {greeting} {displayName} 👋
                </h1>
                <p className="mt-1 text-sm text-[var(--cream)]/90">Daily target: {plan.tdee} kcal</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/20 px-3 py-1">🎯 {goalLabel}</span>
                  <span className="rounded-full bg-white/20 px-3 py-1">🏃 {activityLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full pt-4">
        <div className="rounded-xl border-l-[3px] border-[var(--green)] bg-[var(--cream)] p-4">
          <p className="text-2xl leading-none text-[var(--green)]">&ldquo;</p>
          <p className="mt-1 text-[14px] italic leading-relaxed text-[var(--text)]">{dailyQuote}</p>
          <p className="mt-3 text-right text-xs text-[var(--gray)]">— ChefCoach</p>
        </div>
      </section>

      <section className="w-full pt-4">
        <div className="space-y-6">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">Daily progress</h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <MacroRing
                label="Calories"
                unit="kcal"
                target={plan.tdee}
                logged={lc}
                trackColor="#FDE68A"
                fillColor="#ea580c"
                animationKey={progressTick}
                delayMs={0}
                showPlusInCenter={noMealsYet}
              />
              <MacroRing
                label="Protein"
                unit="g"
                target={plan.protein}
                logged={lp}
                trackColor="#D1E8B0"
                fillColor="var(--green)"
                animationKey={progressTick}
                delayMs={200}
                showPlusInCenter={noMealsYet}
              />
              <MacroRing
                label="Carbs"
                unit="g"
                target={plan.carbs}
                logged={lcarbs}
                trackColor="#FEF3C7"
                fillColor="#d97706"
                animationKey={progressTick}
                delayMs={400}
                showPlusInCenter={noMealsYet}
              />
              <MacroRing
                label="Fat"
                unit="g"
                target={plan.fat}
                logged={lf}
                trackColor="#EDE9FE"
                fillColor="#7c3aed"
                animationKey={progressTick}
                delayMs={600}
                showPlusInCenter={noMealsYet}
              />
            </div>
          </div>

          {!noMealsYet ? (
            <div
              className={`rounded-2xl border px-4 py-4 ${
                overCalories ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                {overCalories ? (
                  <>You’re {Math.round(Math.abs(kcalRemaining)).toLocaleString()} kcal over your daily goal</>
                ) : (
                  <>You have {Math.round(kcalRemaining).toLocaleString()} kcal remaining today</>
                )}
              </p>
              <p className="mt-2 text-sm text-[var(--gray)]">
                {proteinGap > 0 ? (
                  <>
                    Need <strong className="text-[var(--text)]">{Math.round(proteinGap)}g</strong> more protein to hit
                    your goal
                  </>
                ) : proteinGap === 0 ? (
                  <>You hit your protein goal — nice work.</>
                ) : (
                  <>You’re {Math.round(Math.abs(proteinGap))}g over your protein goal today</>
                )}
              </p>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--gray)]">
              Today&apos;s meals logged
            </h3>
            {sortedEntries.length === 0 ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={goCook}
                    className="flex-1 rounded-full bg-[var(--green)] px-4 py-3 text-sm font-semibold text-white"
                  >
                    📸 Scan Fridge
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualModalOpen(true)}
                    className="flex-1 rounded-full border-2 border-[var(--green)] bg-white px-4 py-3 text-sm font-semibold text-[var(--green)]"
                  >
                    ✏️ Log manually
                  </button>
                </div>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {sortedEntries.map((entry) => (
                  <LoggedMealRow
                    key={entry.id}
                    entry={entry}
                    onRemove={() => {
                      removeLoggedMealEntry(todayStr, entry.id);
                      setProgressTick((t) => t + 1);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="w-full pt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">Streak & weekly progress</h2>

        {streak.count >= 1 ? (
          <div className="mt-4 rounded-3xl bg-gradient-to-br from-[#f97316] via-[#ea580c] to-[#c2410c] p-5 text-white shadow-md">
            <p className="text-3xl font-bold leading-tight">🔥 {streak.count} Day Streak</p>
            <p className="mt-2 text-sm text-white/90">Log meals daily to keep it going</p>
            <p className="mt-4 text-sm font-medium text-white/95">⚡ Best streak: {streak.best} days</p>
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--cream)] p-5 shadow-sm">
            <p className="font-playfair text-xl text-[var(--green)]">🌱 Start your streak today</p>
            <p className="mt-2 text-sm text-[var(--gray)]">
              Log your first meal from the Cook tab or use Log manually below.
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--white)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray)]">This week</p>
          <div className="mt-4 flex justify-between gap-1 sm:gap-2">
            {weekDates.map((dateStr, i) => {
              const logged = dayHasMealLog(dateStr);
              const isToday = dateStr === todayStr;
              const cmp = compareYmd(dateStr, todayStr);
              const isPast = cmp < 0;

              let circleClass =
                "flex items-center justify-center rounded-full text-[10px] font-semibold sm:h-9 sm:w-9 h-8 w-8 transition-colors ";
              if (isToday) {
                if (logged) {
                  circleClass +=
                    "bg-[var(--orange)] text-white border-2 border-[var(--orange)] shadow-sm relative z-[1]";
                } else {
                  circleClass +=
                    "bg-[var(--green)] text-white border-2 border-[var(--green)] streak-week-today relative z-[1]";
                }
              } else if (isPast) {
                if (logged) {
                  circleClass +=
                    "bg-[var(--orange)] text-white border-2 border-[var(--orange)] shadow-sm";
                } else {
                  circleClass +=
                    "bg-[var(--gray-light)] text-[var(--gray)] border-2 border-[var(--border)]";
                }
              } else {
                circleClass += "bg-transparent text-[var(--gray)] border-2 border-dashed border-[var(--border)]";
              }

              return (
                <div key={dateStr} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-[var(--gray)] sm:text-xs">
                    {WEEKDAY_LABELS[i]}
                  </span>
                  <div className={circleClass} title={dateStr}>
                    {logged ? "✓" : ""}
                  </div>
                  {isToday ? (
                    <span
                      className={`text-[9px] font-semibold uppercase ${
                        logged ? "text-[var(--orange)]" : "text-[var(--green)]"
                      }`}
                    >
                      Today
                    </span>
                  ) : (
                    <span className="text-[9px] opacity-0" aria-hidden>
                      ·
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="w-full pt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">Today&apos;s meal plan</h2>
        <div className="mt-2 space-y-3">
          {(["Breakfast", "Lunch", "Dinner"] as const).map((mealType) => (
            <TodayMealCard
              key={mealType}
              meal={todayMeals[mealType]}
              mealType={mealType}
              userAllergens={(profile.allergies ?? []).filter((a) => a !== "None")}
              onReplace={() => replaceMeal(mealType)}
            />
          ))}
        </div>
      </section>

      <section className="w-full pt-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-4">
          <h3 className="font-playfair text-lg text-[var(--green)]">💧 Water intake</h3>
          <div className="mt-4 grid grid-cols-8 gap-2">
            {water.map((isFilled, idx) => (
              <button
                key={`water-${idx}`}
                type="button"
                onClick={() => {
                  setWater((prev) => prev.map((v, i) => (i === idx ? !v : v)));
                  const now = Date.now();
                  setWaterTapBurst((prev) => ({ ...prev, [idx]: now }));
                  setWaterDropBurst((prev) => ({ ...prev, [idx]: now }));
                  window.setTimeout(() => {
                    setWaterTapBurst((prev) => {
                      const next = { ...prev };
                      delete next[idx];
                      return next;
                    });
                  }, 320);
                  window.setTimeout(() => {
                    setWaterDropBurst((prev) => {
                      const next = { ...prev };
                      delete next[idx];
                      return next;
                    });
                  }, 650);
                }}
                aria-label={`Toggle water glass ${idx + 1}`}
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center overflow-visible rounded-full border-2 text-base transition ${
                  isFilled
                    ? "border-blue-600 bg-blue-600"
                    : "border-sky-300 bg-sky-100"
                }`}
                style={{
                  animation:
                    waterTapBurst[idx] != null
                      ? "waterGlassTap 0.3s ease-out"
                      : waterCelebrate
                        ? `waterGlassTap 0.3s ease-out ${idx * 0.08}s`
                        : undefined,
                }}
              >
                {waterTapBurst[idx] != null ? (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full border border-blue-300"
                    style={{ animation: "tapRipple 0.45s ease-out" }}
                    aria-hidden
                  />
                ) : null}
                <span className={isFilled ? "opacity-100" : "opacity-30"} aria-hidden>
                  💧
                </span>
                {waterDropBurst[idx] != null ? (
                  <span
                    className="pointer-events-none absolute -top-2 text-[11px]"
                    style={{ animation: "waterDropFloat 0.6s ease-out forwards" }}
                    aria-hidden
                  >
                    💧
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-[var(--text)]">{waterMotivation(filledGlasses)}</p>
          <p className="mt-1 text-xs text-[var(--gray)]">{filledGlasses} of 8 glasses</p>
        </div>
      </section>

      </main>
      </div>

      {manualModalOpen ? (
        <div
          className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setManualModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--white)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-playfair text-xl text-[var(--green)]">Log meal manually</p>
            <label className="mt-4 block text-xs font-semibold uppercase text-[var(--gray)]">Meal name</label>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Chicken salad"
            />
            <label className="mt-3 block text-xs font-semibold uppercase text-[var(--gray)]">Calories</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              value={manualCalories}
              onChange={(e) => setManualCalories(e.target.value)}
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-semibold uppercase text-[var(--gray)]">Protein (g)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-2 py-2 text-sm"
                  value={manualP}
                  onChange={(e) => setManualP(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-[var(--gray)]">Carbs (g)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-2 py-2 text-sm"
                  value={manualC}
                  onChange={(e) => setManualC(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-[var(--gray)]">Fat (g)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-2 py-2 text-sm"
                  value={manualF}
                  onChange={(e) => setManualF(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={saveManualMeal}
              className="mt-6 w-full rounded-full bg-[var(--green)] py-3 text-sm font-semibold text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setManualModalOpen(false)}
              className="mt-2 w-full rounded-full border border-[var(--border)] py-2 text-sm text-[var(--gray)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
    ) : null}
    </>
  );
}
