import type { CookingSkill, HealthFocusId, UserProfile, UserSex } from "@/types";

/** Single source of truth for persisted profile (see onboarding / main app shell). */
export const RECIPIFY_PROFILE_STORAGE_KEY = "recipifyProfile";

export const LEGACY_RECIPIFY_PROFILE_STORAGE_KEY = "recipify_profile";

const HEALTH_FOCUS_IDS = new Set<HealthFocusId>([
  "diabetes",
  "heart",
  "bone_joint",
  "sleep_energy",
  "sports",
  "none",
]);

export function coerceDislikedFoods(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function coerceHealthFocuses(raw: unknown): HealthFocusId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is HealthFocusId =>
      typeof x === "string" && HEALTH_FOCUS_IDS.has(x as HealthFocusId)
  );
}

/** Canonical cuisine chips used in Edit Profile / filters (matches meal `cuisines` where possible). */
export const PROFILE_CUISINE_OPTIONS = [
  "Indian",
  "Italian",
  "Mexican",
  "Mediterranean",
  "Asian",
  "American",
] as const;

function stripEmojiPrefix(s: string): string {
  return s.replace(/^[\p{Emoji_Presentation}\p{Emoji}\s]+/u, "").trim();
}

/** Map legacy onboarding strings or labels to canonical PROFILE_CUISINE_OPTIONS names. */
export function normalizeCuisineLabel(raw: string): string | null {
  const t = stripEmojiPrefix(raw);
  if (!t) return null;
  const lower = t.toLowerCase();
  const direct = PROFILE_CUISINE_OPTIONS.find((c) => c.toLowerCase() === lower);
  if (direct) return direct;
  if (/^(japanese|thai|korean|chinese|vietnamese)$/i.test(t) || /^asian$/i.test(lower)) {
    return "Asian";
  }
  if (/mediterranean|greek|spanish|middle eastern/i.test(t)) return "Mediterranean";
  if (/mexican/i.test(t)) return "Mexican";
  if (/italian/i.test(t)) return "Italian";
  if (/indian/i.test(t)) return "Indian";
  if (/american/i.test(t)) return "American";
  return null;
}

export function coerceCuisinesArray(
  cuisinesRaw: unknown,
  cuisinePreferencesRaw: unknown
): string[] {
  const fromCuisines = Array.isArray(cuisinesRaw)
    ? cuisinesRaw
        .filter((x): x is string => typeof x === "string")
        .map(normalizeCuisineLabel)
        .filter((x): x is string => x !== null)
    : [];
  if (fromCuisines.length > 0) {
    return [...new Set(fromCuisines)];
  }
  const legacy = Array.isArray(cuisinePreferencesRaw)
    ? cuisinePreferencesRaw.filter((x): x is string => typeof x === "string")
    : [];
  const mapped = legacy.map(normalizeCuisineLabel).filter((x): x is string => x !== null);
  return [...new Set(mapped)];
}

function coerceCookingSkill(raw: unknown): CookingSkill | undefined {
  if (raw === "beginner" || raw === "home_cook" || raw === "confident_cook") return raw;
  return undefined;
}

export function defaultUserProfile(): UserProfile {
  return {
    name: "",
    age: 0,
    sex: "female",
    weightKg: 0,
    heightCm: 0,
    goal: "maintain_weight",
    activityLevel: "light",
    goesToGym: false,
    dietaryPreference: "None",
    allergies: [],
    mealsPerDay: 3,
    dislikedFoods: [],
    householdSize: 1,
    kidFriendly: false,
    weeklyFoodBudgetUsd: null,
    proteinForwardWeek: false,
    cuisines: [],
    cookingSkill: "home_cook",
    cuisinePreferences: [],
    healthFocuses: [],
  };
}

/** Copy legacy key into the canonical key, then drop legacy to avoid drift. */
export function migrateLegacyProfileStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const cur = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
    const leg = window.localStorage.getItem(LEGACY_RECIPIFY_PROFILE_STORAGE_KEY);
    if (!cur && leg) {
      window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, leg);
    }
    if (leg) {
      window.localStorage.removeItem(LEGACY_RECIPIFY_PROFILE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/** Read normalised profile from localStorage (browser only). */
export function readProfileFromStorage(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    migrateLegacyProfileStorage();
    const raw = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeUserProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

function coerceSex(raw: unknown): UserSex {
  if (raw === "male" || raw === "female" || raw === "other") return raw;
  return "female";
}

export function normalizeUserProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const d = defaultUserProfile();

  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
        ? Number(v)
        : fallback;

  const dietary =
    typeof r.dietaryPreference === "string" ? r.dietaryPreference : d.dietaryPreference;

  const allergiesRaw = r.allergies;
  const allergies = Array.isArray(allergiesRaw)
    ? allergiesRaw.filter((x): x is string => typeof x === "string")
    : d.allergies;

  const mealsPerDay = [2, 3, 4, 5].includes(num(r.mealsPerDay, 3) as 2 | 3 | 4 | 5)
    ? (num(r.mealsPerDay, 3) as 2 | 3 | 4 | 5)
    : d.mealsPerDay;

  const cuisinePreferences = Array.isArray(r.cuisinePreferences)
    ? r.cuisinePreferences.filter((x): x is string => typeof x === "string")
    : d.cuisinePreferences;

  const cuisines = coerceCuisinesArray(r.cuisines, r.cuisinePreferences);
  const cookingSkill = coerceCookingSkill(r.cookingSkill) ?? d.cookingSkill;

  return {
    ...d,
    name: typeof r.name === "string" ? r.name : d.name,
    age: num(r.age, d.age),
    sex: coerceSex(r.sex),
    weightKg: num(r.weightKg, d.weightKg),
    heightCm: num(r.heightCm, d.heightCm),
    goal:
      r.goal === "lose_weight" || r.goal === "build_muscle" || r.goal === "maintain_weight"
        ? r.goal
        : d.goal,
    activityLevel:
      r.activityLevel === "sedentary" ||
      r.activityLevel === "light" ||
      r.activityLevel === "gym_regular" ||
      r.activityLevel === "athlete"
        ? r.activityLevel
        : d.activityLevel,
    goesToGym: typeof r.goesToGym === "boolean" ? r.goesToGym : d.goesToGym,
    dietaryPreference: dietary as UserProfile["dietaryPreference"],
    allergies,
    mealsPerDay,
    dislikedFoods: coerceDislikedFoods(r.dislikedFoods),
    avatarDataUri:
      r.avatarDataUri === null
        ? null
        : typeof r.avatarDataUri === "string"
          ? r.avatarDataUri
          : d.avatarDataUri,
    householdSize: Math.min(8, Math.max(1, num(r.householdSize, d.householdSize ?? 1))),
    kidFriendly: typeof r.kidFriendly === "boolean" ? r.kidFriendly : d.kidFriendly,
    weeklyFoodBudgetUsd: (() => {
      if (r.weeklyFoodBudgetUsd === null || r.weeklyFoodBudgetUsd === undefined) {
        return d.weeklyFoodBudgetUsd ?? null;
      }
      const s = String(r.weeklyFoodBudgetUsd).trim();
      if (s === "") return null;
      const n = Number(r.weeklyFoodBudgetUsd);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
    proteinForwardWeek:
      typeof r.proteinForwardWeek === "boolean" ? r.proteinForwardWeek : d.proteinForwardWeek,
    cuisines,
    cookingSkill,
    cuisinePreferences: cuisines.length > 0 ? cuisines : cuisinePreferences,
    healthFocuses: coerceHealthFocuses(r.healthFocuses),

    // Subscription fields — stored in profile_data, passed through as-is
    isPro: typeof r.isPro === "boolean" ? r.isPro : undefined,
    freeScansUsed:
      typeof r.freeScansUsed === "number" && Number.isFinite(r.freeScansUsed)
        ? Math.max(0, Math.floor(r.freeScansUsed))
        : undefined,
    subscriptionExpiresAt:
      typeof r.subscriptionExpiresAt === "string"
        ? r.subscriptionExpiresAt
        : r.subscriptionExpiresAt === null
          ? null
          : undefined,
  };
}

/** Return true if the profile's subscriptionExpiresAt is in the future (or null = forever). */
export function isProSubscriptionActive(profile: { isPro?: boolean; subscriptionExpiresAt?: string | null } | null | undefined): boolean {
  if (!profile?.isPro) return false;
  if (!profile.subscriptionExpiresAt) return true; // no expiry = lifetime
  return new Date(profile.subscriptionExpiresAt) > new Date();
}
