import { formatLocalDate, getWeekRangeContaining } from "@/lib/gamification";

const KEY = "recipify_meal_plan_v1";

export type MealSlot = string;

export type DayPlanRow = {
  dateStr: string;
  breakfast: MealSlot;
  lunch: MealSlot;
  dinner: MealSlot;
};

export type WeeklyMealPlan = {
  /** Monday of the displayed week (YYYY-MM-DD). */
  weekStart: string;
  days: DayPlanRow[];
};

export function emptyWeekFromMonday(mondayYmd: string): DayPlanRow[] {
  const monday = new Date(`${mondayYmd}T12:00:00`);
  const days: DayPlanRow[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      dateStr: formatLocalDate(d),
      breakfast: "",
      lunch: "",
      dinner: "",
    });
  }
  return days;
}

export function readMealPlan(): WeeklyMealPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as WeeklyMealPlan;
    if (!p?.weekStart || !Array.isArray(p.days) || p.days.length !== 7) return null;
    return p;
  } catch {
    return null;
  }
}

export function writeMealPlan(plan: WeeklyMealPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(plan));
    window.dispatchEvent(new CustomEvent("recipify-meal-plan-changed"));
  } catch {
    /* ignore */
  }
}

export function currentWeekPlan(): WeeklyMealPlan {
  const range = getWeekRangeContaining(new Date());
  const weekStart = range[0];
  const existing = readMealPlan();
  if (existing && existing.weekStart === weekStart) return existing;
  return { weekStart, days: emptyWeekFromMonday(weekStart) };
}

export function updatePlanSlot(
  plan: WeeklyMealPlan,
  dateStr: string,
  field: "breakfast" | "lunch" | "dinner",
  value: string
): WeeklyMealPlan {
  const days = plan.days.map((d) =>
    d.dateStr === dateStr ? { ...d, [field]: value } : d
  );
  return { ...plan, days };
}

/** Round-robin saved recipe names into empty slots (Mon→Sun, breakfast→dinner). */
export function fillWeekFromSavedRecipeNames(plan: WeeklyMealPlan, names: string[]): WeeklyMealPlan {
  if (names.length === 0) return plan;
  const mealKeys: Array<"breakfast" | "lunch" | "dinner"> = ["breakfast", "lunch", "dinner"];
  let idx = 0;
  const days = plan.days.map((d) => {
    const row = { ...d };
    for (const key of mealKeys) {
      if (!String(row[key]).trim()) {
        row[key] = names[idx % names.length];
        idx += 1;
      }
    }
    return row;
  });
  return { ...plan, days };
}
