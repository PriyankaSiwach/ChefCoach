
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Recipe, UserProfile } from "@/types";
import {
  currentWeekPlan,
  readMealPlan,
  updatePlanSlot,
  writeMealPlan,
  type WeeklyMealPlan,
} from "@/lib/meal-plan";
import {
  readGroceryList,
  writeGroceryList,
  type GroceryItem,
} from "@/lib/grocery-list";
import { formatLocalDate, WEEKDAY_LABELS } from "@/lib/gamification";
import {
  getDailyMeal,
  getRandomMealIdeas,
  getSafeMeals,
  getHeroIngredient,
} from "@/lib/mealFilter";
import type { Meal, MealType } from "@/lib/mealLibrary";

type Props = {
  profile: UserProfile;
  onUpdateProfile: (next: UserProfile) => void;
  favourites: Recipe[];
  lastScanIngredients: string[];
  onGoCook: () => void;
};

type PlanSubTab = "week" | "grocery" | "ideas";

// ── Allergen badge (inline, compact) ──────────────────────────────────────
function AllergenLine({
  allergens,
  userAllergens,
}: {
  allergens: string[];
  userAllergens: string[];
}) {
  if (allergens.length === 0) return null;
  const hasUserAllergen = allergens.some((a) =>
    userAllergens.map((u) => u.toLowerCase()).includes(a.toLowerCase())
  );
  return (
    <p
      className={`mt-1 text-[11px] font-medium ${
        hasUserAllergen ? "text-red-600" : "text-amber-600"
      }`}
    >
      ⚠️ Contains: {allergens.join(", ")}
      {hasUserAllergen && " — may not be safe for your profile"}
    </p>
  );
}

// ── Meal detail sheet ──────────────────────────────────────────────────────
function MealDetailSheet({
  meal,
  userAllergens,
  onClose,
  onAddToPlan,
}: {
  meal: Meal;
  userAllergens: string[];
  onClose: () => void;
  onAddToPlan?: () => void;
}) {
  const hero = getHeroIngredient(meal);
  const flagged = meal.allergens.some((a) =>
    userAllergens.map((u) => u.toLowerCase()).includes(a.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl bg-[var(--white)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <p className="font-playfair text-xl leading-tight text-[var(--green)]">{meal.name}</p>
            <p className="mt-1 text-xs text-[var(--gray)]">{meal.description}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--gray)]"
          >
            ✕
          </button>
        </div>

        {/* Hero ingredient + type tags */}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <span className="flex items-center gap-1 rounded-full bg-[var(--green)] px-3 py-1 text-[11px] font-semibold text-white">
            🥩 {hero}
          </span>
          <span className="rounded-full bg-[var(--gray-light)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--gray)]">
            {meal.type}
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
        <div className="mx-5 mb-3 grid grid-cols-4 gap-2 rounded-2xl bg-[var(--cream)] p-3">
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

        {/* Allergen warning */}
        {meal.allergens.length > 0 ? (
          <div
            className={`mx-5 mb-3 rounded-xl px-3 py-2 text-xs font-medium ${
              flagged ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            ⚠️ Contains: {meal.allergens.join(", ")} — check labels before cooking
            {flagged && (
              <div className="mt-1 font-semibold text-red-700">
                This dish may not be safe for your dietary profile
              </div>
            )}
          </div>
        ) : null}

        {/* Steps */}
        <div className="px-5 pb-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--gray)]">
            How to make it
          </p>
          <ol className="space-y-3">
            {meal.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-[var(--text)]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* CTA */}
        <div className="px-5 pt-4 pb-5">
          {onAddToPlan ? (
            <button
              type="button"
              onClick={onAddToPlan}
              className="w-full rounded-full bg-[var(--green)] py-3 text-sm font-semibold text-white"
            >
              Add to plan
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Plan picker sheet ──────────────────────────────────────────────────────
function PlanPickerSheet({
  meal,
  mealPlan,
  onConfirm,
  onClose,
}: {
  meal: Meal;
  mealPlan: WeeklyMealPlan;
  onConfirm: (dateStr: string, slot: "breakfast" | "lunch" | "dinner") => void;
  onClose: () => void;
}) {
  const todayYmd = formatLocalDate(new Date());
  const [pickDay, setPickDay] = useState(
    mealPlan.days.find((d) => d.dateStr === todayYmd)?.dateStr ?? mealPlan.days[0]?.dateStr ?? ""
  );
  const defaultSlot: "breakfast" | "lunch" | "dinner" =
    meal.type === "breakfast" ? "breakfast" : meal.type === "lunch" ? "lunch" : "dinner";
  const [pickSlot, setPickSlot] = useState<"breakfast" | "lunch" | "dinner">(defaultSlot);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--white)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-playfair text-xl text-[var(--green)]">Add to plan</p>
        <p className="mt-1 text-sm text-[var(--gray)]">{meal.name} — choose day and slot.</p>

        <p className="mt-4 text-xs font-semibold uppercase text-[var(--gray)]">Day</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {mealPlan.days.map((d, i) => (
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

        <p className="mt-4 text-xs font-semibold uppercase text-[var(--gray)]">Meal slot</p>
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
          onClick={() => onConfirm(pickDay, pickSlot)}
          className="mt-6 w-full rounded-full bg-[var(--green)] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add to plan
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

// ── Idea card ──────────────────────────────────────────────────────────────
function IdeaCard({
  meal,
  userAllergens,
  onViewDetail,
  onAddToPlan,
}: {
  meal: Meal;
  userAllergens: string[];
  onViewDetail: () => void;
  onAddToPlan: () => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--white)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-playfair text-lg text-[var(--green)]">{meal.name}</p>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded-full bg-[var(--gray-light)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--gray)]">
          {meal.type}
        </span>
        <span className="rounded-full bg-[var(--gray-light)] px-2 py-0.5 text-[10px] text-[var(--gray)]">
          {meal.calories} cal
        </span>
        {meal.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-full bg-[var(--green-pale)] px-2 py-0.5 text-[10px] font-semibold text-[var(--green)]"
          >
            {t}
          </span>
        ))}
      </div>

      {meal.allergens.length > 0 ? (
        <AllergenLine allergens={meal.allergens} userAllergens={userAllergens} />
      ) : null}

      <button
        type="button"
        onClick={() => setStepsOpen((v) => !v)}
        className="mt-2 text-left text-xs font-medium text-[var(--green)]"
      >
        {stepsOpen ? "▾ Hide steps" : "▸ See steps"}
      </button>

      {stepsOpen ? (
        <ol className="mt-2 space-y-1">
          {meal.steps.map((s, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-[var(--text)]">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-[9px] font-bold text-white">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onViewDetail}
          className="flex-1 rounded-full border border-[var(--green)] py-2 text-xs font-medium text-[var(--green)]"
        >
          View recipe
        </button>
        <button
          type="button"
          onClick={onAddToPlan}
          className="flex-1 rounded-full bg-[var(--green)] py-2 text-xs font-medium text-white"
        >
          Add to plan
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grocery sub-tab (fully self-contained, no API calls)
// ─────────────────────────────────────────────────────────────────────────────

type GroceryCategory = "Produce" | "Dairy" | "Meat" | "Pantry" | "Other";

const CATEGORY_ORDER: GroceryCategory[] = ["Produce", "Dairy", "Meat", "Pantry", "Other"];

const CATEGORY_EMOJI: Record<GroceryCategory, string> = {
  Produce: "🥦",
  Dairy: "🧀",
  Meat: "🍗",
  Pantry: "🫙",
  Other: "📦",
};

const QUICK_ADD_CHIPS = ["Milk", "Eggs", "Bread", "Onion", "Tomato", "Rice", "Chicken", "Yogurt"];

function categorize(label: string): GroceryCategory {
  const l = label.toLowerCase();
  if (
    /chicken|beef|lamb|pork|bacon|steak|mince|sausage|turkey|salmon|tuna|prawn|shrimp|fish|seafood|anchov|cod|halibut|trout/.test(l)
  )
    return "Meat";
  if (
    /milk|cream|butter|cheese|yogurt|feta|mozzarella|parmesan|ricotta|cheddar|ghee|dairy|kefir/.test(l)
  )
    return "Dairy";
  if (
    /onion|tomato|garlic|ginger|pepper|carrot|spinach|cucumber|lettuce|cabbage|mushroom|potato|courgette|broccoli|avocado|lemon|lime|apple|banana|mango|berr|kiwi|herb|basil|coriander|parsley|mint|thyme|celery|aubergine|asparagus|corn|spring onion|fruit|leek|fennel|artichoke|beetroot|radish|pea|snap pea|mangetout|edamame|wakame/.test(l)
  )
    return "Produce";
  if (
    /rice|pasta|flour|bread|oat|sugar|salt|oil|vinegar|soy|miso|tahini|honey|maple|cumin|paprika|turmeric|cinnamon|spice|stock|broth|canned|tin|lentil|chickpea|quinoa|granola|cereal|chocolate|vanilla|baking|sauce|noodle|tortilla|wrap|pita|crouton|coconut milk|almond milk|chia|sesame|sriracha|ketchup|mayo|mustard|pickle|jam|spread/.test(l)
  )
    return "Pantry";
  return "Other";
}

function makeGroceryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function GrocerySubTab() {
  const [items, setItems] = useState<GroceryItem[]>(() => readGroceryList());
  const [input, setInput] = useState("");

  // Persist to localStorage on every change
  useEffect(() => {
    writeGroceryList(items);
  }, [items]);

  // Listen for external changes (e.g. from plan tab "generate" flow)
  useEffect(() => {
    const handler = () => setItems(readGroceryList());
    window.addEventListener("recipify-grocery-changed", handler);
    return () => window.removeEventListener("recipify-grocery-changed", handler);
  }, []);

  const addItem = (label: string) => {
    const t = label.trim();
    if (!t) return;
    setItems((prev) => {
      if (prev.some((x) => x.label.toLowerCase() === t.toLowerCase())) return prev;
      return [...prev, { id: makeGroceryId(), label: t, checked: false }];
    });
  };

  const toggleItem = (id: string) =>
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, checked: !x.checked } : x))
    );

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((x) => x.id !== id));

  const clearChecked = () => setItems((prev) => prev.filter((x) => !x.checked));

  // Group items by category, preserving add order within each group
  const grouped = useMemo<Record<GroceryCategory, GroceryItem[]>>(() => {
    const map: Record<GroceryCategory, GroceryItem[]> = {
      Produce: [],
      Dairy: [],
      Meat: [],
      Pantry: [],
      Other: [],
    };
    for (const item of items) {
      map[categorize(item.label)].push(item);
    }
    return map;
  }, [items]);

  const total = items.length;
  const checkedCount = items.filter((x) => x.checked).length;
  const alreadyPresent = (label: string) =>
    items.some((x) => x.label.toLowerCase() === label.toLowerCase());

  const submitInput = () => {
    addItem(input);
    setInput("");
  };

  return (
    <section className="mx-auto max-w-[920px] px-5 pt-6 pb-4">

      {/* Quick-add chips */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray)]">
          Quick add
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ADD_CHIPS.map((chip) => {
            const added = alreadyPresent(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() => addItem(chip)}
                disabled={added}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  added
                    ? "border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)] opacity-60 cursor-default"
                    : "border-[var(--border)] bg-white text-[var(--text)] active:scale-95"
                }`}
              >
                {added ? "✓ " : "+ "}{chip}
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual add input */}
      <div className="mt-4 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Add any item…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitInput();
          }}
        />
        <button
          type="button"
          onClick={submitInput}
          className="shrink-0 rounded-full bg-[var(--green)] px-4 py-2 text-sm font-semibold text-white"
        >
          Add
        </button>
      </div>

      {/* Status line */}
      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-[var(--gray)]">
            {checkedCount === total && total > 0 ? (
              <span className="font-semibold text-[var(--green)]">
                ✓ All {total} item{total !== 1 ? "s" : ""} ready!
              </span>
            ) : (
              <>
                <span className="font-semibold text-[var(--green)]">{checkedCount}</span>
                {" of "}
                <span className="font-semibold">{total}</span>
                {" item"}{total !== 1 ? "s" : ""} checked
              </>
            )}
          </p>
          {checkedCount > 0 ? (
            <button
              type="button"
              onClick={clearChecked}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--gray)]"
            >
              Clear checked
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Progress bar */}
      {total > 0 ? (
        <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--gray-light)]">
          <div
            className="h-full rounded-full bg-[var(--green)] transition-all duration-300"
            style={{ width: `${Math.round((checkedCount / total) * 100)}%` }}
          />
        </div>
      ) : null}

      {/* Empty state */}
      {total === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">🛒</span>
          <p className="font-playfair text-lg text-[var(--green)]">Your list is empty</p>
          <p className="text-sm text-[var(--gray)]">
            Tap a quick-add chip above or type an item to start your list.
          </p>
        </div>
      ) : null}

      {/* Categorized lists */}
      <div className="mt-5 space-y-5">
        {CATEGORY_ORDER.map((cat) => {
          const catItems = grouped[cat];
          if (catItems.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray)]">
                {CATEGORY_EMOJI[cat]} {cat}
                <span className="rounded-full bg-[var(--gray-light)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--gray)]">
                  {catItems.length}
                </span>
              </p>
              <ul className="space-y-2">
                {catItems.map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-center gap-3 rounded-xl border bg-[var(--white)] px-3 py-2.5 transition ${
                      item.checked
                        ? "border-[var(--border)] opacity-60"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        item.checked
                          ? "border-[var(--green)] bg-[var(--green)]"
                          : "border-[var(--border)] bg-white"
                      }`}
                      aria-checked={item.checked}
                      aria-label={`Toggle ${item.label}`}
                    >
                      {item.checked ? (
                        <svg
                          viewBox="0 0 10 8"
                          className="h-2.5 w-2.5 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M1 4l3 3 5-6" />
                        </svg>
                      ) : null}
                    </button>

                    <span
                      className={`flex-1 text-sm transition ${
                        item.checked ? "text-[var(--gray)] line-through" : "text-[var(--text)]"
                      }`}
                    >
                      {item.label}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="shrink-0 text-[var(--gray)] opacity-40 hover:opacity-80"
                      aria-label={`Remove ${item.label}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Main tips ──────────────────────────────────────────────────────────────
const QUICK_TIPS: Record<UserProfile["goal"], [string, string, string]> = {
  lose_weight: [
    "Use smaller plates and serve vegetables first so naturally lean portions feel satisfying.",
    "Pre-portion snacks into single servings so mindless grazing does not add up.",
    "Slow down meals — it takes minutes for fullness signals to register.",
  ],
  build_muscle: [
    "Spread protein across meals; aim for a solid dose within a few hours after training.",
    "Pair carbs with protein post-workout to refuel without skimping recovery.",
    "Do not fear balanced carbs — they support hard sessions and muscle repair.",
  ],
  maintain_weight: [
    "Fill half the plate with plants, one quarter lean protein, one quarter whole grains or starches.",
    "Stay loosely consistent rather than perfect — habits beat weekend yo-yo cycles.",
    "Hydrate through the day; thirst is often mistaken for hunger.",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PlanTab
// ─────────────────────────────────────────────────────────────────────────────
export function PlanTab({
  profile,
  onUpdateProfile: _onUpdateProfile,
  favourites: _favourites,
  lastScanIngredients: _lastScanIngredients,
  onGoCook: _onGoCook,
}: Props) {
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  const [subTab, setSubTab] = useState<PlanSubTab>("week");
  const [mealIdeas, setMealIdeas] = useState<Meal[]>([]);
  const [detailMeal, setDetailMeal] = useState<Meal | null>(null);
  const [pickerMeal, setPickerMeal] = useState<Meal | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    dateStr: string;
    slot: MealType;
  } | null>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // User allergens derived from profile for warning display
  const userAllergens = useMemo(
    () => (profile.allergies ?? []).filter((a) => a !== "None"),
    [profile.allergies]
  );

  useEffect(() => {
    const w = () => bump();
    window.addEventListener("recipify-grocery-changed", w);
    window.addEventListener("recipify-meal-plan-changed", w);
    return () => {
      window.removeEventListener("recipify-grocery-changed", w);
      window.removeEventListener("recipify-meal-plan-changed", w);
    };
  }, [bump]);

  const week = useMemo(() => {
    const stored = readMealPlan();
    const cur = currentWeekPlan();
    if (stored && stored.weekStart === cur.weekStart) return stored;
    return cur;
  }, [rev]);

  const [mealPlan, setMealPlan] = useState<WeeklyMealPlan>(week);
  useEffect(() => {
    setMealPlan(week);
  }, [week]);

  const todayYmd = formatLocalDate(new Date());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    () => new Set([formatLocalDate(new Date())])
  );

  useEffect(() => {
    setExpandedDays(new Set([formatLocalDate(new Date())]));
  }, [mealPlan.weekStart]);


  const persistPlan = (p: WeeklyMealPlan) => {
    setMealPlan(p);
    writeMealPlan(p);
    bump();
  };

  const onSlotChange = (
    dateStr: string,
    field: "breakfast" | "lunch" | "dinner",
    value: string
  ) => {
    persistPlan(updatePlanSlot(mealPlan, dateStr, field, value));
  };

  // ── Local suggest (no AI call) ─────────────────────────────────────────
  const runLocalSuggest = (dateStr: string, slot: "breakfast" | "lunch" | "dinner") => {
    const dayIndex = mealPlan.days.findIndex((d) => d.dateStr === dateStr);
    const meal = getDailyMeal(slot as MealType, dayIndex >= 0 ? dayIndex : 0, profile);
    onSlotChange(dateStr, slot, meal.name);
  };

  // ── Meal ideas (local random shuffle) ─────────────────────────────────
  useEffect(() => {
    if (subTab === "ideas" && mealIdeas.length === 0) {
      setMealIdeas(getRandomMealIdeas(profile, 6));
    }
  }, [subTab, profile, mealIdeas.length]);

  const refreshMealIdeas = () => {
    setMealIdeas(getRandomMealIdeas(profile, 6));
  };

  const scrollToDay = (dateStr: string) => {
    setExpandedDays((prev) => new Set(prev).add(dateStr));
    requestAnimationFrame(() => {
      dayRefs.current[dateStr]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const toggleDayExpanded = (dateStr: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const tips = QUICK_TIPS[profile.goal];

  return (
    <main className="pb-28 md:pb-12">
      <section className="mx-auto max-w-[920px] px-5 pt-6">
        <div className="rounded-3xl bg-gradient-to-r from-[var(--green)] to-[var(--green-light)] p-5 text-[var(--cream)] shadow-md">
          <h1 className="font-playfair text-3xl">Plan</h1>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(
            [
              ["week", "📅 This Week"],
              ["grocery", "🛒 Grocery"],
              ["ideas", "🥗 Meal Ideas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={
                subTab === id
                  ? "rounded-full bg-[var(--green)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  : "rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--text)]"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── This Week ── */}
      {subTab === "week" ? (
        <section className="mx-auto max-w-[920px] px-5 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:items-start">
            {mealPlan.days.map((d, i) => {
              const expanded = expandedDays.has(d.dateStr);
              const isToday = d.dateStr === todayYmd;
              const title = WEEKDAY_LABELS[i];
              return (
                <div
                  key={d.dateStr}
                  ref={(el) => {
                    dayRefs.current[d.dateStr] = el;
                  }}
                  className={`rounded-2xl border bg-[var(--white)] ${
                    isToday
                      ? "border-l-4 border-l-[var(--green)] border border-[var(--border)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleDayExpanded(d.dateStr)}
                    className="flex w-full items-center justify-between gap-2 p-4 text-left"
                  >
                    <span className="font-playfair text-lg text-[var(--green)]">{title}</span>
                    <span className="flex items-center gap-2">
                      {isToday ? (
                        <span className="rounded-full bg-[var(--green)] px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                          Today
                        </span>
                      ) : null}
                      <span className="text-[var(--gray)]">{expanded ? "▾" : "▸"}</span>
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-[var(--border)] px-4 pb-4 pt-2">
                      {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
                        const slotValue = d[slot];
                        const libraryMeal = slotValue.trim()
                          ? getSafeMeals(profile).find((m) => m.name === slotValue.trim()) ?? null
                          : null;

                        return (
                          <div key={slot} className="mt-3 first:mt-0">
                            {/* Slot label */}
                            <span className="text-[11px] font-semibold uppercase text-[var(--gray)]">
                              {slot}
                            </span>

                            {/* Input row */}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <input
                                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] py-2 pl-3 pr-3 text-sm"
                                style={{ minWidth: "0", width: "100%" }}
                                value={slotValue}
                                onChange={(e) => onSlotChange(d.dateStr, slot, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Tap ✨ to get a suggestion"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runLocalSuggest(d.dateStr, slot);
                                }}
                                className="w-full rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--green)] sm:w-auto sm:whitespace-nowrap"
                              >
                                ✨ Suggest
                              </button>
                            </div>

                            {/* "📋 Steps" pill — only appears after a library meal is in the slot */}
                            {libraryMeal ? (
                              <div className="mt-1.5 flex items-center gap-2">
                                <span className="text-[11px] text-[var(--gray)]">
                                  {libraryMeal.calories} cal · {libraryMeal.protein_g}g protein
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setDetailMeal(libraryMeal)}
                                  className="ml-auto flex items-center gap-1 rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-2.5 py-1 text-[11px] font-semibold text-[var(--green)]"
                                >
                                  📋 Steps
                                </button>
                              </div>
                            ) : slotValue.trim() ? (
                              /* Custom text typed by user — no library entry */
                              <p className="mt-1 text-[11px] text-[var(--gray)]">
                                Custom meal — tap ✨ to replace with a recipe
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Grocery ── */}
      {subTab === "grocery" ? <GrocerySubTab /> : null}

      {/* ── Meal Ideas ── */}
      {subTab === "ideas" ? (
        <section className="mx-auto max-w-[920px] px-5 pt-6">
          <button
            type="button"
            onClick={refreshMealIdeas}
            className="rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-4 py-2 text-sm font-semibold text-[var(--green)]"
          >
            🔀 Refresh ideas
          </button>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {mealIdeas.map((meal) => (
              <IdeaCard
                key={meal.id}
                meal={meal}
                userAllergens={userAllergens}
                onViewDetail={() => setDetailMeal(meal)}
                onAddToPlan={() => setPickerMeal(meal)}
              />
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--cream)]/60 p-5">
            <h3 className="font-playfair text-xl text-[var(--green)]">Quick tips</h3>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-[var(--text)]">
              {tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── Meal detail sheet ── */}
      {detailMeal ? (
        <MealDetailSheet
          meal={detailMeal}
          userAllergens={userAllergens}
          onClose={() => setDetailMeal(null)}
          onAddToPlan={() => {
            setPickerMeal(detailMeal);
            setDetailMeal(null);
          }}
        />
      ) : null}

      {/* ── Plan picker sheet ── */}
      {pickerMeal ? (
        <PlanPickerSheet
          meal={pickerMeal}
          mealPlan={mealPlan}
          onConfirm={(dateStr, slot) => {
            onSlotChange(dateStr, slot, pickerMeal.name);
            setPickerMeal(null);
            setSubTab("week");
            scrollToDay(dateStr);
          }}
          onClose={() => setPickerMeal(null)}
        />
      ) : null}
    </main>
  );
}
