import type { UserProfile } from "@/types";
import { buildUserDietaryRestrictionsPrompt } from "@/lib/dietConstants";
import { getDailyMeal, getSafeMeals } from "@/lib/mealFilter";
import type { MealType } from "@/lib/mealLibrary";
import { readProfileFromStorage } from "@/lib/profileStorage";

function todayDayIndex(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function loadDailyLog(): { calories: number; protein: number; carbs: number; fat: number } {
  if (typeof window === "undefined") {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
  try {
    const key = `recipify_daily_${new Date().toISOString().slice(0, 10)}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      calories: Number(parsed.calories) || 0,
      protein: Number(parsed.protein) || 0,
      carbs: Number(parsed.carbs) || 0,
      fat: Number(parsed.fat) || 0,
    };
  } catch {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
}

function computeTargets(profile: UserProfile) {
  const activityMult: Record<UserProfile["activityLevel"], number> = {
    sedentary: 1.2,
    light: 1.375,
    gym_regular: 1.55,
    athlete: 1.725,
  };
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
    calories,
    protein: Math.round((calories * split.p) / 4),
    carbs: Math.round((calories * split.c) / 4),
    fat: Math.round((calories * split.f) / 9),
  };
}

function mealSuggestion(profile: UserProfile, type: MealType): string {
  const meal = getDailyMeal(type, todayDayIndex(), profile);
  return `${meal.name} (~${meal.calories} kcal, ${meal.protein_g}g protein) — ${meal.description.slice(0, 120)}${meal.description.length > 120 ? "…" : ""}`;
}

function snackSuggestion(profile: UserProfile): string {
  const pool = getSafeMeals(profile)
    .filter((m) => m.calories >= 350 && m.calories <= 550)
    .sort((a, b) => a.calories - b.calories);
  const pick = pool[0] ?? getSafeMeals(profile)[0];
  if (!pick) return "Log a meal from the Cook tab to track progress.";
  return `${pick.name} (~${pick.calories} kcal) works well as a balanced snack from your plan library.`;
}

/** Rule-based coach — no OpenAI (saves API cost; recipes come from meal library). */
export function replyOfflineDietCoach(userText: string): string {
  const profile = readProfileFromStorage();
  const text = userText.toLowerCase();
  const logged = loadDailyLog();
  const name = profile?.name?.trim() || "there";

  if (!profile) {
    return `Hi ${name}! Complete your profile in the app so I can suggest meals from your library.`;
  }

  const targets = computeTargets(profile);
  const restrictions = buildUserDietaryRestrictionsPrompt(profile);

  if (text.includes("protein")) {
    const gap = targets.protein - logged.protein;
    if (gap <= 0) {
      return `Nice work, ${name}! You're at ${Math.round(logged.protein)}g protein today — at or above your ${targets.protein}g target.`;
    }
    const dinner = getDailyMeal("dinner", todayDayIndex(), profile);
    return `You've logged ${Math.round(logged.protein)}g protein so far (target ${targets.protein}g). Try ${dinner.name} for dinner — about ${dinner.protein_g}g protein.${restrictions}`;
  }

  if (text.includes("dinner") || text.includes("tonight")) {
    return `For dinner: ${mealSuggestion(profile, "dinner")}${restrictions}`;
  }

  if (text.includes("lunch")) {
    return `For lunch: ${mealSuggestion(profile, "lunch")}${restrictions}`;
  }

  if (text.includes("breakfast")) {
    return `For breakfast: ${mealSuggestion(profile, "breakfast")}${restrictions}`;
  }

  if (text.includes("snack") || text.includes("500")) {
    return snackSuggestion(profile);
  }

  const kcalLeft = targets.calories - logged.calories;
  if (text.includes("calorie") || text.includes("kcal") || text.includes("macro")) {
    return `Today: ${Math.round(logged.calories)} / ${targets.calories} kcal, ${Math.round(logged.protein)}g / ${targets.protein}g protein. ${kcalLeft > 0 ? `About ${Math.round(kcalLeft)} kcal left.` : "You're at or over your calorie target."}${restrictions}`;
  }

  return `Hi ${name}! I pull tips from your meal library (no AI). Ask about protein today, dinner ideas, or snacks — or scan your fridge on the Cook tab for matches.${restrictions}`;
}
