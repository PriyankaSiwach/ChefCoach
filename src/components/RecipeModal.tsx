
import { useEffect, useMemo, useState } from "react";
import type { Recipe, RecipeResultItem } from "@/types";
import { getRecipeRating, setRecipeRating } from "@/lib/recipe-ratings";
import {
  currentWeekPlan,
  readMealPlan,
  updatePlanSlot,
  writeMealPlan,
} from "@/lib/meal-plan";
import { formatLocalDate, WEEKDAY_LABELS } from "@/lib/gamification";
import {
  AlertIcon,
  CalendarIcon,
  ChartIcon,
  ClockIcon,
  IconLabel,
  MacroCaloriesIcon,
  MacroCarbsIcon,
  MacroFatIcon,
  MacroProteinIcon,
  TimerIcon,
} from "@/components/icons/AppIcons";

export type RecipeModalRecipe = Recipe | RecipeResultItem;

function inferDifficulty(steps: string[]): "Easy" | "Medium" | "Hard" {
  const n = steps.length;
  if (n <= 3) return "Easy";
  if (n <= 5) return "Medium";
  return "Hard";
}

function normalizeRecipe(r: RecipeModalRecipe): RecipeResultItem {
  const base = r as RecipeResultItem;
  return {
    ...r,
    ingredientsUsed: base.ingredientsUsed ?? [],
    missingOptionalIngredients: base.missingOptionalIngredients ?? [],
    difficulty: base.difficulty ?? inferDifficulty(r.steps),
    healthNote: base.healthNote ?? "",
    substitutions: base.substitutions ?? [],
    hardcodedAllergens: base.hardcodedAllergens,
    ingredientMatchCount: base.ingredientMatchCount,
  };
}

/** Returns duration in seconds if the step mentions cook/wait time */
export function extractStepDurationSeconds(step: string): number | null {
  const s = step.toLowerCase();
  const hr = s.match(/(\d+)\s*(?:hour|hours|hr)\b/);
  if (hr) return parseInt(hr[1], 10) * 3600;
  const min = s.match(/(\d+)\s*(?:minute|minutes|min)\b/);
  if (min) return parseInt(min[1], 10) * 60;
  const sec = s.match(/(\d+)\s*(?:second|seconds|secs?)\b/);
  if (sec) return parseInt(sec[1], 10);
  return null;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type TimerOverlayProps = {
  initialSeconds: number;
  onClose: () => void;
};

function StepTimerOverlay({ initialSeconds, onClose }: TimerOverlayProps) {
  const [left, setLeft] = useState(initialSeconds);

  useEffect(() => {
    setLeft(initialSeconds);
    const id = window.setInterval(() => {
      setLeft((x) => {
        if (x <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return x - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [initialSeconds]);

  const done = left <= 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--white)] p-6 shadow-xl">
        <p className="text-center font-playfair text-xl text-[var(--green)]">
          {done ? "Time’s up!" : "Timer"}
        </p>
        <p className="mt-4 text-center font-playfair text-5xl tabular-nums text-[var(--text)]">
          {formatCountdown(done ? 0 : left)}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-[var(--green)] py-3 text-sm font-medium text-white"
        >
          {done ? "Done" : "Close"}
        </button>
      </div>
    </div>
  );
}

type CookStepsProps = {
  steps: string[];
  open: boolean;
  onClose: () => void;
  title: string;
};

function allergenBannerText(recipe: RecipeResultItem): string | null {
  const list = recipe.hardcodedAllergens?.length
    ? recipe.hardcodedAllergens
    : inferAllergensFallback(recipe);
  if (!list.length) return null;
  return list.join(", ");
}

function inferAllergensFallback(recipe: RecipeResultItem): string[] {
  const text = `${recipe.name} ${recipe.description} ${recipe.diet}`.toLowerCase();
  const found: string[] = [];
  if (/milk|cream|cheese|butter|yogurt|dairy|parmesan|mozzarella|feta|ricotta/.test(text))
    found.push("dairy");
  if (/flour|bread|pasta|spaghetti|noodle|wheat|gluten|tortilla|wrap|pita|bun/.test(text))
    found.push("gluten");
  if (/egg|omelette|frittata|quiche/.test(text)) found.push("eggs");
  if (/nut|almond|cashew|walnut|pecan|peanut/.test(text)) found.push("nuts");
  if (/shrimp|prawn|crab|lobster|shellfish|clam|mussel|scallop/.test(text))
    found.push("shellfish");
  if (/soy|tofu|edamame|miso|tempeh/.test(text)) found.push("soy");
  if (/salmon|tuna|cod|halibut|tilapia|fish/.test(text)) found.push("fish");
  if (/sesame|tahini/.test(text)) found.push("sesame");
  return found;
}

function AddToWeekPlanSheet({
  recipeName,
  onClose,
}: {
  recipeName: string;
  onClose: () => void;
}) {
  const week = useMemo(() => {
    const stored = readMealPlan();
    const cur = currentWeekPlan();
    if (stored && stored.weekStart === cur.weekStart) return stored;
    return cur;
  }, []);

  const todayYmd = formatLocalDate(new Date());
  const [pickDay, setPickDay] = useState(
    () => week.days.find((d) => d.dateStr === todayYmd)?.dateStr ?? week.days[0]?.dateStr ?? ""
  );
  const [pickSlot, setPickSlot] = useState<"breakfast" | "lunch" | "dinner">("dinner");

  const confirm = () => {
    if (!pickDay) return;
    const next = updatePlanSlot(week, pickDay, pickSlot, recipeName);
    writeMealPlan(next);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--white)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-playfair text-xl text-[var(--green)]">Add to this week&apos;s plan</p>
        <p className="mt-1 text-sm text-[var(--gray)]">{recipeName}</p>

        <p className="mt-4 text-[11px] font-semibold uppercase text-[var(--gray)]">Day</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {week.days.map((d, i) => (
            <button
              key={d.dateStr}
              type="button"
              title={WEEKDAY_LABELS[i]}
              onClick={() => setPickDay(d.dateStr)}
              className={`rounded-lg border py-2 text-[10px] font-semibold sm:text-xs ${
                pickDay === d.dateStr
                  ? "border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)]"
                  : "border-[var(--border)] text-[var(--green)]"
              }`}
            >
              {WEEKDAY_LABELS[i]}
            </button>
          ))}
        </div>

        <p className="mt-4 text-[11px] font-semibold uppercase text-[var(--gray)]">Meal</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["breakfast", "lunch", "dinner"] as const).map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setPickSlot(slot)}
              className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ${
                pickSlot === slot
                  ? "bg-[var(--green)] text-white"
                  : "border border-[var(--border)] bg-white text-[var(--text)]"
              }`}
            >
              {slot}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!pickDay}
          onClick={confirm}
          className="mt-6 w-full rounded-full bg-[var(--green)] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save to plan
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-full border border-[var(--border)] py-2 text-sm text-[var(--gray)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CookStepsOverlay({ steps, open, onClose, title }: CookStepsProps) {
  const [ix, setIx] = useState(0);

  useEffect(() => {
    if (open) setIx(0);
  }, [open, title]);

  if (!open || steps.length === 0) return null;

  const last = steps.length - 1;

  return (
    <div className="fixed inset-0 z-[76] flex flex-col bg-[var(--cream)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--white)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="min-w-0 flex-1 truncate font-playfair text-lg text-[var(--green)]">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--gray)]"
        >
          Exit
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-8 pt-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--gray)]">
          Step {ix + 1} / {steps.length}
        </p>
        <p className="mt-6 max-w-lg font-playfair text-2xl leading-snug text-[var(--text)] md:text-[26px]">
          {steps[ix]}
        </p>
        <div className="mt-8 flex gap-2">
          {steps.map((_, i) => (
            <span
              key={`dot-${i}`}
              className={`h-2 w-2 rounded-full ${i === ix ? "bg-[var(--green)]" : "bg-[var(--gray-light)]"}`}
            />
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-3 border-t border-[var(--border)] bg-[var(--white)] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={ix === 0}
          onClick={() => setIx((n) => Math.max(0, n - 1))}
          className="flex-1 rounded-full border border-[var(--border)] py-3 text-sm font-medium text-[var(--gray)] disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (ix >= last) onClose();
            else setIx((n) => n + 1);
          }}
          className="flex-1 rounded-full bg-[var(--green)] py-3 text-sm font-semibold text-white"
        >
          {ix >= last ? "Finish" : "Next step"}
        </button>
      </div>
    </div>
  );
}

type Props = {
  recipe: RecipeModalRecipe | null;
  open: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (recipe: Recipe) => void;
  onLogMeal: (recipe: Recipe) => void;
};

function GreenCheckRow({
  checked,
  onToggle,
  label,
  dashed,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        dashed ? "border-dashed border-[var(--border)] bg-[var(--cream)]" : "border-[var(--border)] bg-[var(--white)]"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
          checked
            ? "border-[var(--green)] bg-[var(--green)] text-white"
            : "border-[var(--border)] bg-[var(--white)]"
        }`}
        aria-hidden
      >
        {checked ? (
          <svg className="h-3 w-3" viewBox="0 0 12 10" fill="none" aria-hidden>
            <path
              d="M1 5l4 4 6-8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span
        className={`text-sm leading-snug ${checked ? "text-[var(--gray)] line-through" : "text-[var(--text)]"}`}
      >
        {label}
      </span>
    </button>
  );
}

export function RecipeModal({
  recipe,
  open,
  onClose,
  isSaved,
  onToggleSave,
  onLogMeal,
}: Props) {
  const full = recipe ? normalizeRecipe(recipe) : null;

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerStepIdx, setTimerStepIdx] = useState<number | null>(null);
  const [cookOpen, setCookOpen] = useState(false);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [stars, setStars] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [rateNote, setRateNote] = useState("");

  useEffect(() => {
    if (open && full) {
      setChecked({});
      setTimerSeconds(null);
      setTimerStepIdx(null);
      setCookOpen(false);
      setPlanSheetOpen(false);
      const r = getRecipeRating(full.name);
      setStars(r ? (r.stars as 1 | 2 | 3 | 4 | 5) : 0);
      setRateNote(r?.note ?? "");
    }
  }, [open, full?.name]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !full) return null;

  const allergenText = allergenBannerText(full);

  const toggleIng = (key: string) => {
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  };

  const handleLog = () => {
    onLogMeal(full);
    onClose();
  };

  const handleSave = () => {
    onToggleSave(full);
  };

  return (
    <>
      <div
        className="recipe-modal-overlay fixed inset-0 z-[60] flex flex-col bg-[var(--white)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-modal-title"
      >
        <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--white)]/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--green)] hover:bg-[var(--green-pale)]"
            aria-label="Go back"
          >
            ← Back
          </button>
          <h2
            id="recipe-modal-title"
            className="min-w-0 flex-1 truncate font-playfair text-lg leading-tight text-[var(--text)] sm:text-xl"
          >
            {full.name}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCookOpen(true)}
              className="rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-2.5 py-2 text-[11px] font-semibold text-[var(--green)] sm:px-3 sm:text-xs"
            >
              Cook
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] px-2.5 py-2 text-sm text-[var(--gray)] hover:bg-[var(--gray-light)]"
              aria-label="Close recipe"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="recipe-modal-inner mx-auto w-full max-w-[680px] px-5 pb-[80px] pt-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--green-pale)] px-3 py-1.5 text-xs font-medium text-[var(--green)]">
              <IconLabel icon={<ClockIcon />}>{full.cookTime}</IconLabel>
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-xs font-medium text-[var(--gray)]">
              {full.difficulty}
            </span>
            {full.diet ? (
              <span className="rounded-full bg-[var(--orange-pale)] px-3 py-1.5 text-xs font-medium text-[var(--orange)]">
                {full.diet}
              </span>
            ) : null}
          </div>

          {allergenText ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              <IconLabel icon={<AlertIcon />}>Contains: {allergenText} — verify before cooking</IconLabel>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <span className="flex flex-col items-center gap-1 rounded-2xl bg-[var(--orange-pale)] px-3 py-3 text-center text-base font-semibold text-[var(--orange)]">
              <MacroCaloriesIcon className="h-4 w-4" />
              {full.calories} kcal
            </span>
            <span className="flex flex-col items-center gap-1 rounded-2xl bg-[var(--green-pale)] px-3 py-3 text-center text-base font-semibold text-[var(--green)]">
              <MacroProteinIcon className="h-4 w-4" />
              {full.protein_g}g protein
            </span>
            <span className="flex flex-col items-center gap-1 rounded-2xl bg-amber-50 px-3 py-3 text-center text-base font-semibold text-amber-900">
              <MacroCarbsIcon className="h-4 w-4" />
              {full.carbs_g}g carbs
            </span>
            <span className="flex flex-col items-center gap-1 rounded-2xl bg-purple-50 px-3 py-3 text-center text-base font-semibold text-purple-900">
              <MacroFatIcon className="h-4 w-4" />
              {full.fat_g}g fat
            </span>
          </div>

          <section className="mt-8">
            <h3 className="font-playfair text-xl text-[var(--green)]">Ingredients</h3>
            <p className="mt-1 text-xs text-[var(--gray)]">Check off as you prep</p>

            {full.ingredientsUsed.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--gray)]">
                  From your fridge
                </p>
                <ul className="space-y-2">
                  {full.ingredientsUsed.map((ing) => {
                    const key = `u:${ing}`;
                    const isOn = checked[key];
                    return (
                      <li key={key}>
                        <GreenCheckRow
                          checked={!!isOn}
                          onToggle={() => toggleIng(key)}
                          label={ing}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {full.missingOptionalIngredients.length > 0 ? (
              <div className={full.ingredientsUsed.length > 0 ? "mt-6" : "mt-4"}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--gray)]">
                  Optional add-ins
                </p>
                <ul className="space-y-2">
                  {full.missingOptionalIngredients.map((ing) => {
                    const key = `o:${ing}`;
                    const isOn = checked[key];
                    return (
                      <li key={key}>
                        <GreenCheckRow
                          checked={!!isOn}
                          onToggle={() => toggleIng(key)}
                          label={ing}
                          dashed
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {full.ingredientsUsed.length === 0 && full.missingOptionalIngredients.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--gray)]">
                No ingredient list for this recipe — follow the steps below.
              </p>
            ) : null}
          </section>

          <section className="mt-10 mb-4">
            <h3 className="font-playfair text-xl text-[var(--green)]">Instructions</h3>
            <ol className="mt-6 space-y-10">
              {full.steps.map((step, idx) => {
                const dur = extractStepDurationSeconds(step);
                const timerActive = timerStepIdx === idx && timerSeconds !== null;
                return (
                  <li key={`step-${idx}`} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-sm font-semibold text-white">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm leading-relaxed text-[var(--text)]">{step}</p>
                      {dur !== null ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTimerSeconds(dur);
                            setTimerStepIdx(idx);
                          }}
                          className={`recipe-modal-timer-btn mt-3 inline-flex items-center gap-2 rounded-full border-2 border-[var(--green)] bg-[var(--green-pale)] px-4 py-2.5 text-sm font-semibold text-[var(--green)] shadow-sm transition ${
                            timerActive ? "recipe-modal-timer-btn--active" : ""
                          }`}
                        >
                          <IconLabel icon={<TimerIcon className="h-3.5 w-3.5" />}>
                            Timer ({dur >= 60 ? `${Math.round(dur / 60)} min` : `${dur}s`})
                          </IconLabel>
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="mt-10 mb-6">
            <button
              type="button"
              onClick={() => setPlanSheetOpen(true)}
              className="w-full rounded-full border-2 border-[var(--green)] bg-[var(--green-pale)] py-3.5 text-sm font-semibold text-[var(--green)] shadow-sm"
            >
              <IconLabel icon={<CalendarIcon className="h-4 w-4" />}>Add to this week&apos;s plan</IconLabel>
            </button>
          </section>

          <section className="mt-10 mb-4 rounded-2xl border border-[var(--border)] bg-[var(--green-pale)]/40 p-5">
            <h3 className="font-playfair text-xl text-[var(--green)]">How was it?</h3>
            <p className="mt-1 text-xs text-[var(--gray)]">Your rating stays on this device and improves future picks.</p>
            <div className="mt-3 flex gap-1">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} stars`}
                  onClick={() => {
                    setStars(n);
                    setRecipeRating(full.name, n, rateNote);
                  }}
                  className={`rounded-lg px-2 py-1 text-2xl transition ${
                    stars >= n ? "text-amber-500" : "text-[var(--gray-light)]"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs font-medium text-[var(--gray)]">Quick note (optional)</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm"
              rows={2}
              placeholder="e.g. Kids loved it — try less salt next time"
              value={rateNote}
              onChange={(e) => setRateNote(e.target.value)}
              onBlur={() => {
                if (stars > 0) {
                  setRecipeRating(
                    full.name,
                    stars as 1 | 2 | 3 | 4 | 5,
                    rateNote
                  );
                }
              }}
            />
          </section>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-[70] border-t border-[var(--border)] bg-[var(--white)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-[680px] gap-3">
            <button
              type="button"
              onClick={handleSave}
              aria-pressed={isSaved}
              className={`flex-1 rounded-full py-3.5 text-sm font-semibold transition ${
                isSaved
                  ? "border-2 border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)] hover:bg-[var(--green)]/10"
                  : "border-2 border-[var(--green)] bg-[var(--green)] text-white hover:brightness-[1.03]"
              }`}
            >
              {isSaved ? "Unsave" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleLog}
              className="flex-1 rounded-full bg-[var(--green)] py-3.5 text-sm font-semibold text-white"
            >
              <IconLabel icon={<ChartIcon className="h-4 w-4" />}>Log This Meal</IconLabel>
            </button>
          </div>
        </div>
      </div>

      <CookStepsOverlay
        steps={full.steps}
        open={cookOpen}
        onClose={() => setCookOpen(false)}
        title={full.name}
      />

      {timerSeconds !== null ? (
        <StepTimerOverlay
          initialSeconds={timerSeconds}
          onClose={() => {
            setTimerSeconds(null);
            setTimerStepIdx(null);
          }}
        />
      ) : null}

      {planSheetOpen ? (
        <AddToWeekPlanSheet recipeName={full.name} onClose={() => setPlanSheetOpen(false)} />
      ) : null}
    </>
  );
}
