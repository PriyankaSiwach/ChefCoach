import type { Recipe } from "@/types";
import type { UserProfile } from "@/types";
import { bumpWasteImpactAfterMealLog } from "@/lib/waste-impact";

export type StreakData = {
  count: number;
  lastDate: string;
  best: number;
};

export type AchievementId = "first_meal" | "streak_3" | "protein_pro" | "fridge_master";

export type AchievementUnlock = {
  id: AchievementId;
  emoji: string;
  title: string;
  description: string;
};

const STREAK_KEY = "recipify_streak";
const ACHIEVEMENTS_KEY = "recipify_achievements";

export type AchievementStore = {
  unlocked: Partial<Record<AchievementId, string>>;
  proteinHitDays: string[];
  fridgeFingerprints: string[];
};

function dispatchStatsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("recipify-stats-changed"));
}

function dispatchAchievements(unlocks: AchievementUnlock[]) {
  if (typeof window === "undefined" || unlocks.length === 0) return;
  window.dispatchEvent(new CustomEvent("recipify-achievements", { detail: unlocks }));
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenEarlierAndLater(earlierYmd: string, laterYmd: string): number {
  const a = new Date(`${earlierYmd}T12:00:00`);
  const b = new Date(`${laterYmd}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function dailyLogKey(dateStr: string): string {
  return `recipify_daily_${dateStr}`;
}

function readStreak(): StreakData {
  if (typeof window === "undefined") {
    return { count: 0, lastDate: "", best: 0 };
  }
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    if (!raw) return { count: 0, lastDate: "", best: 0 };
    const p = JSON.parse(raw) as Partial<StreakData>;
    return {
      count: typeof p.count === "number" ? p.count : 0,
      lastDate: typeof p.lastDate === "string" ? p.lastDate : "",
      best: typeof p.best === "number" ? p.best : 0,
    };
  } catch {
    return { count: 0, lastDate: "", best: 0 };
  }
}

function writeStreak(data: StreakData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function readAchievementStore(): AchievementStore {
  if (typeof window === "undefined") {
    return { unlocked: {}, proteinHitDays: [], fridgeFingerprints: [] };
  }
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return { unlocked: {}, proteinHitDays: [], fridgeFingerprints: [] };
    const p = JSON.parse(raw) as Partial<AchievementStore>;
    return {
      unlocked: (p.unlocked ?? {}) as AchievementStore["unlocked"],
      proteinHitDays: Array.isArray(p.proteinHitDays)
        ? p.proteinHitDays.filter((x): x is string => typeof x === "string")
        : [],
      fridgeFingerprints: Array.isArray(p.fridgeFingerprints)
        ? p.fridgeFingerprints.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return { unlocked: {}, proteinHitDays: [], fridgeFingerprints: [] };
  }
}

function writeAchievementStore(store: AchievementStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function computeProteinTarget(profile: UserProfile): number {
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
  let splitP = 0.25;
  if (profile.goal === "lose_weight") splitP = 0.35;
  if (profile.goal === "build_muscle") splitP = 0.3;
  return Math.round((calories * splitP) / 4);
}

export type LoggedMealEntry = {
  id: string;
  name: string;
  loggedAt: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyLogData = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: LoggedMealEntry[];
};

function newMealId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDailyLogRaw(raw: string | null): DailyLogData {
  const empty: DailyLogData = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    entries: [],
  };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const calories = Number(p.calories) || 0;
    const protein = Number(p.protein) || 0;
    const carbs = Number(p.carbs) || 0;
    const fat = Number(p.fat) || 0;
    let entries: LoggedMealEntry[] = [];
    if (Array.isArray(p.entries)) {
      entries = p.entries
        .filter((x): x is LoggedMealEntry => x != null && typeof x === "object")
        .map((x) => ({
          id: typeof (x as LoggedMealEntry).id === "string" ? (x as LoggedMealEntry).id : newMealId(),
          name: typeof (x as LoggedMealEntry).name === "string" ? (x as LoggedMealEntry).name : "Meal",
          loggedAt:
            typeof (x as LoggedMealEntry).loggedAt === "string"
              ? (x as LoggedMealEntry).loggedAt
              : new Date().toISOString(),
          calories: Number((x as LoggedMealEntry).calories) || 0,
          protein_g: Number((x as LoggedMealEntry).protein_g) || 0,
          carbs_g: Number((x as LoggedMealEntry).carbs_g) || 0,
          fat_g: Number((x as LoggedMealEntry).fat_g) || 0,
        }));
    }
    if (entries.length === 0 && (calories > 0 || protein > 0)) {
      entries = [
        {
          id: "legacy-migrated",
          name: "Logged meals",
          loggedAt: new Date().toISOString(),
          calories,
          protein_g: protein,
          carbs_g: carbs,
          fat_g: fat,
        },
      ];
    }
    return { calories, protein, carbs, fat, entries };
  } catch {
    return empty;
  }
}

export function readDailyLog(dateStr: string): DailyLogData {
  if (typeof window === "undefined") {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, entries: [] };
  }
  const raw = window.localStorage.getItem(dailyLogKey(dateStr));
  const parsed = parseDailyLogRaw(raw);
  if (
    parsed.entries.length === 1 &&
    parsed.entries[0].id === "legacy-migrated" &&
    raw &&
    !raw.includes('"entries"')
  ) {
    try {
      window.localStorage.setItem(dailyLogKey(dateStr), JSON.stringify(parsed));
    } catch {
      /* ignore */
    }
  }
  return parsed;
}

function writeDailyLog(dateStr: string, data: DailyLogData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dailyLogKey(dateStr), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function dispatchMealLogged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("meal-logged"));
}

function readDailyTotals(dateStr: string): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const d = readDailyLog(dateStr);
  return {
    calories: d.calories,
    protein: d.protein,
    carbs: d.carbs,
    fat: d.fat,
  };
}

/** Remove one logged meal row; updates totals. Dispatches stats + meal-logged. */
export function removeLoggedMealEntry(dateStr: string, entryId: string): void {
  if (typeof window === "undefined") return;
  const log = readDailyLog(dateStr);
  const entry = log.entries.find((e) => e.id === entryId);
  if (!entry) return;
  const next: DailyLogData = {
    calories: Math.max(0, log.calories - entry.calories),
    protein: Math.max(0, log.protein - entry.protein_g),
    carbs: Math.max(0, log.carbs - entry.carbs_g),
    fat: Math.max(0, log.fat - entry.fat_g),
    entries: log.entries.filter((e) => e.id !== entryId),
  };
  writeDailyLog(dateStr, next);
  dispatchStatsChanged();
  dispatchMealLogged();
}

/** Update streak after a meal log (call after daily totals are saved). */
export function updateStreakAfterMealLog(): void {
  if (typeof window === "undefined") return;
  const today = formatLocalDate(new Date());
  let { count, lastDate, best } = readStreak();

  if (lastDate === today) {
    best = Math.max(best, count);
    writeStreak({ count, lastDate, best });
    return;
  }

  if (!lastDate) {
    count = 1;
  } else {
    const gap = daysBetweenEarlierAndLater(lastDate, today);
    if (gap === 1) count += 1;
    else if (gap >= 2) count = 1;
    else count = 1;
  }

  lastDate = today;
  best = Math.max(best, count);
  writeStreak({ count, lastDate, best });
}

export function evaluateAchievementsAfterMeal(profile: UserProfile | null): AchievementUnlock[] {
  if (typeof window === "undefined") return [];
  const today = formatLocalDate(new Date());
  const streak = readStreak();
  const store = readAchievementStore();
  const unlocks: AchievementUnlock[] = [];
  const todayTotals = readDailyTotals(today);

  const markUnlock = (id: AchievementId, emoji: string, title: string, description: string) => {
    if (store.unlocked[id]) return;
    const iso = new Date().toISOString();
    store.unlocked[id] = iso;
    unlocks.push({ id, emoji, title, description });
  };

  if (todayTotals.calories > 0 || todayTotals.protein > 0) {
    markUnlock(
      "first_meal",
      "🌱",
      "First Meal",
      "You logged your very first meal — amazing start!"
    );
  }

  if (streak.count >= 3 && !store.unlocked.streak_3) {
    markUnlock("streak_3", "🔥", "3-Day Streak", "Three days in a row — consistency wins!");
  }

  if (profile) {
    const target = computeProteinTarget(profile);
    if (target > 0 && todayTotals.protein >= target) {
      if (!store.proteinHitDays.includes(today)) {
        store.proteinHitDays.push(today);
      }
      const uniqueDays = [...new Set(store.proteinHitDays)];
      store.proteinHitDays = uniqueDays;
      if (uniqueDays.length >= 5 && !store.unlocked.protein_pro) {
        markUnlock(
          "protein_pro",
          "💪",
          "Protein Pro",
          "You hit your protein goal on five separate days!"
        );
      }
    }
  }

  writeAchievementStore(store);
  return unlocks;
}

export function recordFridgeScan(imageDataUri: string | null): AchievementUnlock[] {
  if (typeof window === "undefined" || !imageDataUri) return [];
  const fingerprint = simpleFingerprint(imageDataUri);
  const store = readAchievementStore();
  const unlocks: AchievementUnlock[] = [];

  if (!store.fridgeFingerprints.includes(fingerprint)) {
    store.fridgeFingerprints.push(fingerprint);
  }

  const markUnlock = (id: AchievementId, emoji: string, title: string, description: string) => {
    if (store.unlocked[id]) return;
    store.unlocked[id] = new Date().toISOString();
    unlocks.push({ id, emoji, title, description });
  };

  if (store.fridgeFingerprints.length >= 10 && !store.unlocked.fridge_master) {
    markUnlock(
      "fridge_master",
      "📸",
      "Fridge Master",
      "You scanned ten different fridge photos — legend!"
    );
  }

  writeAchievementStore(store);
  if (unlocks.length) dispatchAchievements(unlocks);
  dispatchStatsChanged();
  return unlocks;
}

function simpleFingerprint(data: string): string {
  let h = 5381;
  const slice = data.slice(0, Math.min(2000, data.length));
  for (let i = 0; i < slice.length; i += 1) {
    h = (h * 33) ^ slice.charCodeAt(i);
  }
  return `${h}-${data.length}`;
}

/** Merge recipe macros into today's daily log, update streak, evaluate achievements, dispatch events. */
export function appendRecipeToDailyLog(recipe: Recipe, profile: UserProfile | null): void {
  if (typeof window === "undefined") return;
  const today = formatLocalDate(new Date());
  const log = readDailyLog(today);
  const entry: LoggedMealEntry = {
    id: newMealId(),
    name: recipe.name,
    loggedAt: new Date().toISOString(),
    calories: recipe.calories,
    protein_g: recipe.protein_g,
    carbs_g: recipe.carbs_g,
    fat_g: recipe.fat_g,
  };
  const next: DailyLogData = {
    calories: log.calories + recipe.calories,
    protein: log.protein + recipe.protein_g,
    carbs: log.carbs + recipe.carbs_g,
    fat: log.fat + recipe.fat_g,
    entries: [...log.entries, entry],
  };
  writeDailyLog(today, next);

  updateStreakAfterMealLog();
  const batch = evaluateAchievementsAfterMeal(profile);
  dispatchAchievements(batch);
  dispatchStatsChanged();
  dispatchMealLogged();
  bumpWasteImpactAfterMealLog();
}

/** Add a manually entered meal to the daily log (same pipeline as recipe log). */
export function appendManualMealToDailyLog(
  dateStr: string,
  meal: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number },
  profile: UserProfile | null
): void {
  if (typeof window === "undefined") return;
  const log = readDailyLog(dateStr);
  const entry: LoggedMealEntry = {
    id: newMealId(),
    name: meal.name.trim() || "Meal",
    loggedAt: new Date().toISOString(),
    calories: Math.max(0, meal.calories),
    protein_g: Math.max(0, meal.protein_g),
    carbs_g: Math.max(0, meal.carbs_g),
    fat_g: Math.max(0, meal.fat_g),
  };
  const next: DailyLogData = {
    calories: log.calories + entry.calories,
    protein: log.protein + entry.protein_g,
    carbs: log.carbs + entry.carbs_g,
    fat: log.fat + entry.fat_g,
    entries: [...log.entries, entry],
  };
  writeDailyLog(dateStr, next);

  updateStreakAfterMealLog();
  const batch = evaluateAchievementsAfterMeal(profile);
  dispatchAchievements(batch);
  dispatchStatsChanged();
  dispatchMealLogged();
  bumpWasteImpactAfterMealLog();
}

export function getStreakDisplay(): StreakData {
  return readStreak();
}

export function getAchievementDisplay(): AchievementStore {
  return readAchievementStore();
}

export function dayHasMealLog(dateStr: string): boolean {
  const t = readDailyTotals(dateStr);
  return t.calories > 0 || t.protein > 0;
}

/** Monday–Sunday week containing `date`, as YYYY-MM-DD strings (local). */
export function getWeekRangeContaining(date: Date): string[] {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(12, 0, 0, 0);
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(formatLocalDate(x));
  }
  return out;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const ACHIEVEMENT_DEFS: Array<{
  id: AchievementId;
  emoji: string;
  title: string;
  lockedHint: string;
}> = [
  {
    id: "first_meal",
    emoji: "🌱",
    title: "First Meal",
    lockedHint: "Log your first meal",
  },
  {
    id: "streak_3",
    emoji: "🔥",
    title: "3-Day Streak",
    lockedHint: "Log 3 days in a row",
  },
  {
    id: "protein_pro",
    emoji: "💪",
    title: "Protein Pro",
    lockedHint: "Hit protein goal 5 times",
  },
  {
    id: "fridge_master",
    emoji: "📸",
    title: "Fridge Master",
    lockedHint: "Scan 10 different photos",
  },
];
