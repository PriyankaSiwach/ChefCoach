
import { useEffect, useMemo, useState } from "react";
import type { HealthFocusId, UserProfile } from "@/types";
import {
  coerceCuisinesArray,
  coerceDislikedFoods,
  coerceHealthFocuses,
  defaultUserProfile,
  normalizeCuisineLabel,
  RECIPIFY_PROFILE_STORAGE_KEY,
  PROFILE_CUISINE_OPTIONS,
} from "@/lib/profileStorage";
import { ALLERGY_OPTIONS, DIETARY_STYLE_OPTIONS, isDietStyleOption } from "@/lib/dietConstants";
import { upsertProfileToSupabase } from "@/lib/profileSupabase";
import { useAuth } from "@/contexts/AuthContext";
import { AllergySafetyNotice } from "@/components/AllergySafetyNotice";
import { UnitToggleInput } from "@/components/UnitToggleInput";
import {
  ChefHatIcon,
  HeartIcon,
  IconLabel,
  MacroProteinIcon,
  SparklesIcon,
  TargetIcon,
  UserIcon,
} from "@/components/icons/AppIcons";
import { Activity, Scale, UtensilsCrossed } from "lucide-react";

type Props = {
  initialProfile?: UserProfile | null;
  onComplete: (profile: UserProfile) => void;
};

const allergies = [...ALLERGY_OPTIONS];
const dietaryStyles = [...DIETARY_STYLE_OPTIONS];
const CUISINES = [...PROFILE_CUISINE_OPTIONS];

const STEP_LABELS = ["About you", "Lifestyle", "Diet", "Goals", "Cuisines"];

const HEALTH_FOCUS_CHIPS: { id: HealthFocusId; label: string }[] = [
  { id: "diabetes", label: "Managing diabetes" },
  { id: "heart", label: "Heart health" },
  { id: "bone_joint", label: "Bone & joint health" },
  { id: "sleep_energy", label: "Better sleep & energy" },
  { id: "sports", label: "Sports performance" },
  { id: "none", label: "No specific focus" },
];

type Motivation = "fun" | "just_cooking" | "health" | "family";

function titleForStep(step: number): string {
  switch (step) {
    case 1:
      return "Tell us about yourself";
    case 2:
      return "Your lifestyle";
    case 3:
      return "Food preferences";
    case 4:
      return "Health goals";
    default:
      return "Your food world";
  }
}

function stepHintForStep(step: number): string {
  switch (step) {
    case 1:
      return "This helps us personalize your meal and calorie targets.";
    case 2:
      return "Choose what feels most like your real routine and motivation.";
    case 3:
      return "Diet shapes which recipes we show; allergies keep unsafe dishes out.";
    case 4:
      return "Optional — we’ll gently prioritise meals that fit your focus.";
    default:
      return "Pick the cuisines you love — we'll suggest meals that match your taste.";
  }
}

function initialCuisineChipsFromProfile(profile: UserProfile | null | undefined): string[] {
  if (!profile) return [];
  const canon = coerceCuisinesArray(profile.cuisines, profile.cuisinePreferences);
  if (canon.length === 0) return [];
  const chips: string[] = [];
  for (const c of canon) {
    if (!chips.includes(c)) chips.push(c);
  }
  return chips;
}

function initialDietStyleKey(profile: UserProfile | null | undefined): string | null {
  if (!profile?.dietaryPreference || profile.dietaryPreference === "None") return null;
  const first = profile.dietaryPreference.split(",")[0]?.trim();
  if (!first || first === "None") return null;
  if (isDietStyleOption(first)) return first;
  return null;
}

export function OnboardingModal({ initialProfile, onComplete }: Props) {
  const { user } = useAuth();
  const baseDefaults = useMemo(
    () => ({ ...defaultUserProfile(), ...initialProfile }),
    [initialProfile]
  );

  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState<"fwd" | "back">("fwd");
  const [step1Name, setStep1Name] = useState(initialProfile?.name ?? "");
  const [step1Age, setStep1Age] = useState(
    initialProfile != null ? String(initialProfile.age) : ""
  );
  const [step1Weight, setStep1Weight] = useState(
    initialProfile != null ? String(initialProfile.weightKg) : ""
  );
  const [step1Height, setStep1Height] = useState(
    initialProfile != null ? String(initialProfile.heightCm) : ""
  );
  const [step1Errors, setStep1Errors] = useState<{
    name?: string;
    age?: string;
    weightKg?: string;
    heightCm?: string;
  }>({});

  const [motivation, setMotivation] = useState<Motivation>(() => {
    if (initialProfile?.goesToGym) return "fun";
    return "just_cooking";
  });

  const [dietStyleKey, setDietStyleKey] = useState<string | null>(() =>
    initialDietStyleKey(initialProfile ?? null)
  );

  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(() =>
    initialCuisineChipsFromProfile(initialProfile ?? null)
  );

  const [healthFocuses, setHealthFocuses] = useState<HealthFocusId[]>(() =>
    coerceHealthFocuses(initialProfile?.healthFocuses)
  );

  const [dislikeDraft, setDislikeDraft] = useState("");

  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...baseDefaults,
    dislikedFoods: coerceDislikedFoods(initialProfile?.dislikedFoods),
  }));

  const progress = useMemo(() => `${(step / 5) * 100}%`, [step]);
  const slideClass =
    stepDirection === "fwd" ? "onboarding-slide-in-right" : "onboarding-slide-in-left";

  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (dietStyleKey !== "Vegan") return;
    setProfile((p) => {
      const next = new Set(
        [...(p.allergies ?? []).filter((x) => x !== "None"), "Dairy", "Eggs"]
      );
      return { ...p, allergies: Array.from(next) };
    });
  }, [dietStyleKey]);

  const validateStep1 = () => {
    const next: typeof step1Errors = {};
    if (!step1Name.trim()) next.name = "Please enter your name.";
    if (!step1Age.trim()) {
      next.age = "Please enter your age.";
    } else {
      const age = Number(step1Age);
      if (!Number.isFinite(age) || age < 10 || age > 100) {
        next.age = "Age must be between 10 and 100.";
      }
    }
    if (!step1Weight.trim()) {
      next.weightKg = "Please enter your weight.";
    } else {
      const w = Number(step1Weight);
      if (!Number.isFinite(w) || w < 20 || w > 300) {
        next.weightKg = "Please enter a valid weight (20–300 kg / 44–660 lb).";
      }
    }
    if (!step1Height.trim()) {
      next.heightCm = "Please enter your height.";
    } else {
      const h = Number(step1Height);
      if (!Number.isFinite(h) || h < 50 || h > 250) {
        next.heightCm = "Please enter a valid height (50–250 cm / 20–98 in).";
      }
    }
    setStep1Errors(next);
    return Object.keys(next).length === 0;
  };

  const applyMotivation = (m: Motivation) => {
    setMotivation(m);
    if (m === "family") {
      setProfile((p) => ({ ...p, householdSize: 3, kidFriendly: true }));
    }
  };

  const selectDietStyle = (key: string | null) => {
    setDietStyleKey(key);
  };

  const toggleHealthFocus = (id: HealthFocusId) => {
    if (id === "none") {
      setHealthFocuses([]);
      return;
    }
    setHealthFocuses((prev) => {
      const withoutNone = prev.filter((x) => x !== "none");
      if (withoutNone.includes(id)) {
        return withoutNone.filter((x) => x !== id);
      }
      return [...withoutNone, id];
    });
  };

  const addDislikeChipsFromDraft = () => {
    const parts = dislikeDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setProfile((p) => {
      const merged = new Set([...p.dislikedFoods, ...parts]);
      return { ...p, dislikedFoods: Array.from(merged) };
    });
    setDislikeDraft("");
  };

  const removeDislike = (tag: string) => {
    setProfile((p) => ({
      ...p,
      dislikedFoods: p.dislikedFoods.filter((x) => x !== tag),
    }));
  };

  const advanceOrComplete = () => {
    if (step === 1) {
      if (!validateStep1()) return;
      const age = Number(step1Age);
      const weightKg = Number(step1Weight);
      const heightCm = Number(step1Height);
      setProfile((p) => ({
        ...p,
        name: step1Name.trim(),
        age,
        weightKg,
        heightCm,
      }));
      setStep1Errors({});
      setStepDirection("fwd");
      setStep(2);
      return;
    }
    if (step < 5) {
      setStepDirection("fwd");
      setStep((s) => s + 1);
      return;
    }

    const dietaryPreferenceValue = dietStyleKey ?? "None";

    let allergiesFinal = [...profile.allergies];
    if (dietaryPreferenceValue === "Vegan") {
      allergiesFinal = [
        ...new Set([...allergiesFinal.filter((x) => x !== "None"), "Dairy", "Eggs"]),
      ];
    }
    if (allergiesFinal.includes("None")) {
      allergiesFinal = ["None"];
    }

    const cleanCuisines = selectedCuisines.map((c) =>
      c.replace(/^[\p{Emoji}\s]+/u, "").trim()
    );
    const cuisinesCanonical = [
      ...new Set(
        cleanCuisines
          .map((c) => normalizeCuisineLabel(c))
          .filter((x): x is string => x !== null)
      ),
    ];

    const healthClean = healthFocuses.filter((x) => x !== "none");

    const completed: UserProfile = {
      ...profile,
      dietaryPreference: dietaryPreferenceValue as UserProfile["dietaryPreference"],
      goesToGym: motivation === "fun",
      mealsPerDay: 3,
      allergies: allergiesFinal,
      dislikedFoods: profile.dislikedFoods,
      householdSize: Math.min(8, Math.max(1, profile.householdSize ?? 1)),
      kidFriendly: profile.kidFriendly ?? false,
      weeklyFoodBudgetUsd: profile.weeklyFoodBudgetUsd ?? null,
      proteinForwardWeek: profile.proteinForwardWeek ?? false,
      cuisines: cuisinesCanonical,
      cuisinePreferences: cuisinesCanonical,
      healthFocuses: healthClean,
    };

    try {
      window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(completed));
    } catch {
      // onComplete still updates app state
    }
    if (user?.id) {
      void upsertProfileToSupabase(user.id, completed).then(({ error }) => {
        if (error) console.warn("Profile sync after onboarding:", error);
      });
    }
    onComplete(completed);
  };

  const goBack = () => {
    if (step <= 1) return;
    setStepDirection("back");
    if (step === 2) {
      setStep1Name(profile.name);
      setStep1Age(profile.age ? String(profile.age) : "");
      setStep1Weight(profile.weightKg ? String(profile.weightKg) : "");
      setStep1Height(profile.heightCm ? String(profile.heightCm) : "");
      setStep1Errors({});
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const stepHint = stepHintForStep(step);

  return (
    <main className="screen-overlay fixed inset-0 z-[95] overflow-x-hidden overflow-y-auto bg-[var(--cream)]">
      <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col px-4 py-5 sm:px-5 sm:py-6">
      <section className="w-full min-w-0 flex-1 rounded-3xl border border-[var(--border)] bg-[var(--white)] p-4 shadow-sm sm:p-6 md:p-8">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <h1 className="min-w-0 font-playfair text-2xl leading-snug text-[var(--green)] sm:text-3xl md:text-4xl">
            {titleForStep(step)}
          </h1>
          <span className="shrink-0 text-xs text-[var(--gray)]">Step {step} of 5</span>
        </div>
        <p className="mb-4 text-sm text-[var(--gray)]">{stepHint}</p>
        <div className="mb-2 h-1.5 w-full rounded-full bg-[var(--gray-light)]">
          <div
            className="h-full rounded-full bg-[var(--green)] transition-all"
            style={{ width: progress }}
          />
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-[10px] leading-tight text-[var(--gray)] sm:text-[11px]">
          {STEP_LABELS.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1">
              {i > 0 ? <span className="text-[var(--border)]">→</span> : null}
              <span
                className={
                  step === i + 1 ? "font-semibold text-[var(--green)]" : ""
                }
              >
                {label}
              </span>
            </span>
          ))}
        </div>

        {step === 1 ? (
          <div className={`space-y-3 ${slideClass}`}>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--gray)]">
                Your name
              </label>
              <input
                aria-label="Your name"
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                placeholder="Your name"
                value={step1Name}
                onChange={(e) => {
                  setStep1Name(e.target.value);
                  setStep1Errors((er) => ({ ...er, name: undefined }));
                }}
              />
              {step1Errors.name ? (
                <p className="mt-1 text-xs text-red-600">{step1Errors.name}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--gray)]">Age</label>
              <input
                aria-label="Age"
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                type="number"
                placeholder="25"
                value={step1Age}
                onChange={(e) => {
                  setStep1Age(e.target.value);
                  setStep1Errors((er) => ({ ...er, age: undefined }));
                }}
              />
              {step1Errors.age ? (
                <p className="mt-1 text-xs text-red-600">{step1Errors.age}</p>
              ) : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--gray)]">Biological sex</p>
              <p className="mb-2 text-[11px] leading-snug text-[var(--gray)]">
                Used for calorie calculation only.
              </p>
              <div className="flex gap-2">
                {(["male", "female", "other"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`flex-1 rounded-full border px-3 py-2 text-xs ${
                      profile.sex === s
                        ? "border-[var(--green)] bg-[var(--green)] text-white"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => update("sex", s)}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <UnitToggleInput
              type="weight"
              valueInBase={step1Weight}
              onChange={(v) => {
                setStep1Weight(v);
                setStep1Errors((er) => ({ ...er, weightKg: undefined }));
              }}
              error={step1Errors.weightKg}
            />
            <UnitToggleInput
              type="height"
              valueInBase={step1Height}
              onChange={(v) => {
                setStep1Height(v);
                setStep1Errors((er) => ({ ...er, heightCm: undefined }));
              }}
              error={step1Errors.heightCm}
            />
            <p className="text-[11px] leading-relaxed text-[var(--gray)]">
              Used only to calculate your daily calorie target. Never shared.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className={`space-y-3 ${slideClass}`}>
            <div className="flex flex-wrap gap-2">
              {[
                { k: "lose_weight", l: "Lose weight", Icon: TargetIcon },
                { k: "build_muscle", l: "Build muscle", Icon: MacroProteinIcon },
                { k: "maintain_weight", l: "Stay balanced", Icon: Scale },
              ].map(({ k, l, Icon }) => (
                <button
                  key={k}
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs ${
                    profile.goal === k
                      ? "border-[var(--green)] bg-[var(--green)] text-white"
                      : "border-[var(--border)]"
                  }`}
                  onClick={() => update("goal", k as UserProfile["goal"])}
                >
                  <IconLabel icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{l}</IconLabel>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { k: "sedentary", l: "Mostly sitting", Icon: Scale },
                { k: "light", l: "Lightly active", Icon: Activity },
                { k: "gym_regular", l: "Gym regular", Icon: MacroProteinIcon },
                { k: "athlete", l: "Very active", Icon: Activity },
              ].map(({ k, l, Icon }) => (
                <button
                  key={k}
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs ${
                    profile.activityLevel === k
                      ? "border-[var(--green)] bg-[var(--green)] text-white"
                      : "border-[var(--border)]"
                  }`}
                  onClick={() =>
                    update("activityLevel", k as UserProfile["activityLevel"])
                  }
                >
                  <IconLabel icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{l}</IconLabel>
                </button>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--gray)]">
                What brings you here?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => applyMotivation("fun")}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    motivation === "fun"
                      ? "border-[var(--green)] bg-[var(--green-pale)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <SparklesIcon className="h-4 w-4" />
                    For fun
                  </p>
                  <p className="mt-1 text-xs text-[var(--gray)]">
                    I want healthy ideas and variety.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => applyMotivation("just_cooking")}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    motivation === "just_cooking"
                      ? "border-[var(--green)] bg-[var(--green-pale)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <ChefHatIcon className="h-4 w-4" />
                    Just for cooking
                  </p>
                  <p className="mt-1 text-xs text-[var(--gray)]">
                    Keep it simple and easy to cook.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => applyMotivation("health")}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    motivation === "health"
                      ? "border-[var(--green)] bg-[var(--green-pale)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <HeartIcon className="h-4 w-4" />
                    Managing health
                  </p>
                  <p className="mt-1 text-xs text-[var(--gray)]">
                    I want to eat better for my wellbeing.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => applyMotivation("family")}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    motivation === "family"
                      ? "border-[var(--green)] bg-[var(--green-pale)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <UserIcon className="h-4 w-4" />
                    Feeding a family
                  </p>
                  <p className="mt-1 text-xs text-[var(--gray)]">
                    I need practical meals for multiple people.
                  </p>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className={`space-y-4 ${slideClass}`}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text)]">
                Dietary style
              </p>
              <p className="mb-2 text-xs text-[var(--gray)]">
                Affects what recipes are shown.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs ${
                    dietStyleKey === null
                      ? "border-[var(--green)] bg-[var(--green)] text-white"
                      : "border-[var(--border)]"
                  }`}
                  onClick={() => selectDietStyle(null)}
                >
                  <IconLabel icon={<UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />}>
                    No restriction
                  </IconLabel>
                </button>
                {dietaryStyles.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-xs transition ${
                      dietStyleKey === d
                        ? "border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)]"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => selectDietStyle(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {dietStyleKey === "Vegan" ? (
                <p className="mt-2 text-xs text-[var(--green)]">
                  We&apos;ve flagged dairy and eggs based on your diet choice.
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text)]">
                Allergies
              </p>
              <p className="mb-2 text-[11px] leading-relaxed text-[var(--gray)]">
                Select any ingredients you&apos;re allergic or sensitive to. We&apos;ll hide
                recipes containing them and warn you on all dishes.
              </p>
              <AllergySafetyNotice />
              <div className="flex flex-wrap gap-2">
                {allergies.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-xs ${
                      profile.allergies.includes(a)
                        ? "border-[var(--green)] bg-[var(--green)] text-white"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => {
                      if (a === "None") return update("allergies", ["None"]);
                      const has = profile.allergies.includes(a);
                      const next = has
                        ? profile.allergies.filter((x) => x !== a)
                        : [...profile.allergies.filter((x) => x !== "None"), a];
                      update("allergies", next);
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--gray)]">
                Foods you dislike
              </label>
              <input
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                placeholder="Type an ingredient and press Enter or comma"
                value={dislikeDraft}
                onChange={(e) => setDislikeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addDislikeChipsFromDraft();
                  }
                }}
              />
              {profile.dislikedFoods.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.dislikedFoods.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--cream)] px-3 py-1 text-xs font-medium text-[var(--text)]"
                      onClick={() => removeDislike(tag)}
                    >
                      {tag}
                      <span className="text-[var(--gray)]" aria-hidden>
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className={`space-y-3 ${slideClass}`}>
            <p className="text-sm font-medium text-[var(--text)]">Any health focus?</p>
            <p className="text-xs text-[var(--gray)]">
              Skip if you like — this only nudges which meals we surface first.
            </p>
            <div className="flex flex-wrap gap-2">
              {HEALTH_FOCUS_CHIPS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs ${
                    id === "none"
                      ? healthFocuses.length === 0
                        ? "border-[var(--green)] bg-[var(--green)] text-white"
                        : "border-[var(--border)]"
                      : healthFocuses.includes(id)
                        ? "border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)]"
                        : "border-[var(--border)]"
                  }`}
                  onClick={() => toggleHealthFocus(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className={`space-y-3 ${slideClass}`}>
            <p className="text-sm text-[var(--gray)]">
              Pick all the cuisines you enjoy — you can choose as many as you like.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-full border px-3 py-2 text-xs ${
                  selectedCuisines.length === 0
                    ? "border-[var(--green)] bg-[var(--green)] text-white"
                    : "border-[var(--border)]"
                }`}
                onClick={() => setSelectedCuisines([])}
              >
                🌍 All cuisines
              </button>
              {CUISINES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs transition ${
                    selectedCuisines.includes(c)
                      ? "border-[var(--green)] bg-[var(--green-pale)] font-semibold text-[var(--green)]"
                      : "border-[var(--border)]"
                  }`}
                  onClick={() =>
                    setSelectedCuisines((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                    )
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            {selectedCuisines.length > 0 ? (
              <p className="text-xs text-[var(--green)]">
                ✓ {selectedCuisines.length} selected — we&apos;ll prioritise these in your
                suggestions.
              </p>
            ) : (
              <p className="text-xs text-[var(--gray)]">
                No preference selected — we&apos;ll show meals from all cuisines.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-5 flex justify-between gap-2">
          <button
            type="button"
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--gray)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={goBack}
            disabled={step === 1}
          >
            Back
          </button>
          <button
            type="button"
            className="rounded-full bg-[var(--green)] px-5 py-2 text-sm text-white"
            onClick={advanceOrComplete}
          >
            {step < 5 ? "Next" : "Complete Setup"}
          </button>
        </div>
      </section>
      </div>
    </main>
  );
}
