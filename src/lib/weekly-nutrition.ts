import { formatLocalDate, readDailyLog } from "@/lib/gamification";

export type WeekNutritionTotals = {
  daysWithData: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Sum macros for the last 7 calendar days (including today). */
export function aggregateLast7Days(): WeekNutritionTotals {
  if (typeof window === "undefined") {
    return { daysWithData: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
  const out: WeekNutritionTotals = {
    daysWithData: 0,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const today = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatLocalDate(d);
    const log = readDailyLog(dateStr);
    if (log.calories > 0 || log.protein > 0) {
      out.daysWithData += 1;
      out.calories += log.calories;
      out.protein += log.protein;
      out.carbs += log.carbs;
      out.fat += log.fat;
    }
  }
  return out;
}
