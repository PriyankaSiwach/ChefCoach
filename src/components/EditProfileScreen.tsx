
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { CookingSkill, HealthFocusId, UserProfile } from "@/types";
import {
  coerceCuisinesArray,
  coerceDislikedFoods,
  coerceHealthFocuses,
  PROFILE_CUISINE_OPTIONS,
  RECIPIFY_PROFILE_STORAGE_KEY,
} from "@/lib/profileStorage";
import { ALLERGY_OPTIONS, DIETARY_STYLE_OPTIONS, isDietStyleOption } from "@/lib/dietConstants";
import { useToast } from "./Toast";
import { AllergySafetyNotice } from "@/components/AllergySafetyNotice";
import { UnitToggleInput } from "@/components/UnitToggleInput";
import {
  LifestyleProfileSection,
  type Motivation,
} from "@/components/LifestyleProfileSection";
import { IconLabel, UserIcon } from "@/components/icons/AppIcons";
import { UtensilsCrossed } from "lucide-react";

type Props = {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onClose: () => void;
};

const allergies = [...ALLERGY_OPTIONS];
const dietaryStyles = [...DIETARY_STYLE_OPTIONS];

const COOKING_SKILL_OPTIONS: { id: CookingSkill; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "home_cook", label: "Home cook" },
  { id: "confident_cook", label: "Confident cook" },
];

const HEALTH_FOCUS_CHIPS: { id: HealthFocusId; label: string }[] = [
  { id: "diabetes", label: "Managing diabetes" },
  { id: "heart", label: "Heart health" },
  { id: "bone_joint", label: "Bone & joint health" },
  { id: "sleep_energy", label: "Better sleep & energy" },
  { id: "sports", label: "Sports performance" },
  { id: "none", label: "No specific focus" },
];

const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
const MAX_DATA_URI_CHARS = 900_000;
const isNative = Capacitor.isNativePlatform();

/** Pick a profile photo via Capacitor Camera on native (handles iPad + permissions). */
async function pickAvatarNative(): Promise<{ dataUrl: string | null; error?: string }> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: true,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      promptLabelHeader: "Profile photo",
      promptLabelPhoto: "Choose from Photos",
      promptLabelPicture: "Take a Photo",
    });
    return { dataUrl: photo.dataUrl ?? null };
  } catch (err) {
    const msg = String(err).toLowerCase();
    if (
      msg.includes("cancelled") ||
      msg.includes("canceled") ||
      msg.includes("no image picked") ||
      msg.includes("user cancelled") ||
      msg.includes("user canceled")
    ) {
      return { dataUrl: null };
    }
    if (
      msg.includes("denied") ||
      msg.includes("permission") ||
      msg.includes("restricted") ||
      msg.includes("access")
    ) {
      return {
        dataUrl: null,
        error: "Camera or photo access is required. Go to Settings → ChefCoach and enable Camera and Photos.",
      };
    }
    console.warn("[Avatar picker]", err);
    return { dataUrl: null, error: "Unable to open photo picker. Please try again." };
  }
}

function initialDietStyleKey(profile: UserProfile): string | null {
  if (!profile.dietaryPreference || profile.dietaryPreference === "None") return null;
  const first = profile.dietaryPreference.split(",")[0]?.trim();
  if (!first) return null;
  return isDietStyleOption(first) ? first : null;
}

export function EditProfileScreen({ profile, onSave, onClose }: Props) {
  const showToast = useToast();
  const [step1Name, setStep1Name] = useState(profile.name);
  const [step1Weight, setStep1Weight] = useState(
    profile.weightKg > 0 ? String(profile.weightKg) : ""
  );
  const [step1Errors, setStep1Errors] = useState<{
    name?: string;
    weightKg?: string;
  }>({});

  const [motivation, setMotivation] = useState<Motivation>(() => {
    if (profile.goesToGym) return "fun";
    if ((profile.householdSize ?? 1) >= 3 && profile.kidFriendly) return "family";
    return "just_cooking";
  });

  const [dietStyleKey, setDietStyleKey] = useState<string | null>(() =>
    initialDietStyleKey(profile)
  );

  const [healthFocuses, setHealthFocuses] = useState<HealthFocusId[]>(() =>
    coerceHealthFocuses(profile.healthFocuses)
  );

  const [dislikeDraft, setDislikeDraft] = useState("");

  const [inner, setInner] = useState<UserProfile>(() => ({
    ...profile,
    dislikedFoods: coerceDislikedFoods(profile.dislikedFoods),
  }));

  const [cookingSkill, setCookingSkill] = useState<CookingSkill>(
    profile.cookingSkill ?? "home_cook"
  );
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(() =>
    coerceCuisinesArray(profile.cuisines, profile.cuisinePreferences)
  );

  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(
    profile.avatarDataUri ?? null
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setInner((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (dietStyleKey !== "Vegan") return;
    setInner((p) => {
      const next = new Set(
        [...(p.allergies ?? []).filter((x) => x !== "None"), "Dairy", "Eggs"]
      );
      return { ...p, allergies: Array.from(next) };
    });
  }, [dietStyleKey]);

  const validateStep1 = () => {
    const next: typeof step1Errors = {};
    if (!step1Name.trim()) next.name = "Please enter your name.";
    if (step1Weight.trim()) {
      const w = Number(step1Weight);
      if (!Number.isFinite(w) || w < 20 || w > 300) {
        next.weightKg = "Please enter a valid weight (20–300 kg / 44–660 lb).";
      }
    }
    setStep1Errors(next);
    return Object.keys(next).length === 0;
  };

  const applyMotivation = (m: Motivation) => {
    setMotivation(m);
    if (m === "family") {
      setInner((p) => ({ ...p, householdSize: 3, kidFriendly: true }));
    }
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
    setInner((p) => {
      const merged = new Set([...p.dislikedFoods, ...parts]);
      return { ...p, dislikedFoods: Array.from(merged) };
    });
    setDislikeDraft("");
  };

  const removeDislike = (tag: string) => {
    setInner((p) => ({
      ...p,
      dislikedFoods: p.dislikedFoods.filter((x) => x !== tag),
    }));
  };

  const togglePreferredCuisine = (label: string) => {
    if (label === "No preference") {
      setSelectedCuisines([]);
      return;
    }
    setSelectedCuisines((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  };

  const onAvatarPick = (file: File | undefined) => {
    setAvatarError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setAvatarError("Image is too large. Please choose one under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== "string") return;
      if (data.length > MAX_DATA_URI_CHARS) {
        setAvatarError("That image is still too large after loading. Try a smaller photo.");
        return;
      }
      setAvatarDataUri(data);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarTap = async () => {
    setAvatarError(null);
    if (isNative) {
      setAvatarLoading(true);
      try {
        const result = await pickAvatarNative();
        if (result.error) {
          setAvatarError(result.error);
        } else if (result.dataUrl) {
          if (result.dataUrl.length > MAX_DATA_URI_CHARS) {
            setAvatarError("That image is too large. Try a smaller photo.");
          } else {
            setAvatarDataUri(result.dataUrl);
          }
        }
      } finally {
        setAvatarLoading(false);
      }
    } else {
      avatarInputRef.current?.click();
    }
  };

  const handleSave = () => {
    if (!validateStep1()) return;

    const dietaryPreferenceValue = dietStyleKey ?? "None";

    let allergiesFinal = [...inner.allergies];
    if (dietaryPreferenceValue === "Vegan") {
      allergiesFinal = [
        ...new Set([...allergiesFinal.filter((x) => x !== "None"), "Dairy", "Eggs"]),
      ];
    }
    if (allergiesFinal.includes("None")) {
      allergiesFinal = ["None"];
    }

    const healthClean = healthFocuses.filter((x) => x !== "none");
    const cuisinesSaved = [...selectedCuisines];

    const saved: UserProfile = {
      ...inner,
      name: step1Name.trim(),
      age: profile.age ?? 30,
      weightKg: step1Weight.trim() ? Number(step1Weight) : 0,
      heightCm: 0,
      dietaryPreference: dietaryPreferenceValue as UserProfile["dietaryPreference"],
      goesToGym: motivation === "fun",
      mealsPerDay: inner.mealsPerDay ?? 3,
      allergies: allergiesFinal,
      dislikedFoods: inner.dislikedFoods,
      healthFocuses: healthClean,
      avatarDataUri: avatarDataUri ?? null,
      householdSize: Math.min(8, Math.max(1, inner.householdSize ?? 1)),
      kidFriendly: inner.kidFriendly ?? false,
      weeklyFoodBudgetUsd: inner.weeklyFoodBudgetUsd ?? null,
      proteinForwardWeek: inner.proteinForwardWeek ?? false,
      cookingSkill,
      cuisines: cuisinesSaved,
      cuisinePreferences: cuisinesSaved,
    };

    try {
      window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // still update app state below
    }
    onSave(saved);
    showToast("Profile saved ✓", "success");
    onClose();
  };

  return (
    <div className="inset-safe fixed inset-0 z-[100] overflow-y-auto bg-[var(--cream)]">
      <main className="mx-auto min-h-full w-full max-w-[680px] px-4 py-6 pb-28 md:px-6 md:py-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--gray)]"
          >
            ← Back
          </button>
          <h1 className="font-playfair text-2xl text-[var(--green)] md:text-3xl">
            Edit profile
          </h1>
        </div>

        <div className="space-y-8">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm md:p-6">
            <h2 className="font-playfair text-xl text-[var(--green)]">Profile photo</h2>
            <p className="mt-1 text-xs text-[var(--gray)]">
              Optional — stored on this device only.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--gray-light)]">
                {avatarDataUri ? (
                  <img
                    src={avatarDataUri}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-10 w-10 text-[var(--gray)]" aria-hidden />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={avatarLoading}
                  onClick={() => void handleAvatarTap()}
                  className="cursor-pointer rounded-full bg-[var(--green)] px-4 py-2 text-center text-sm text-white disabled:opacity-60"
                >
                  {avatarLoading ? "Opening…" : "Choose photo"}
                </button>
                {/* Web-only hidden file input */}
                {!isNative && (
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onAvatarPick(e.target.files?.[0])}
                  />
                )}
                {avatarDataUri ? (
                  <button
                    type="button"
                    className="text-sm text-[var(--gray)] underline"
                    onClick={() => {
                      setAvatarDataUri(null);
                      setAvatarError(null);
                    }}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
            {avatarError ? (
              <p className="mt-2 text-xs text-red-600">{avatarError}</p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm md:p-6">
            <h2 className="font-playfair text-xl text-[var(--green)]">About you</h2>
            <p className="mt-1 text-xs text-[var(--gray)]">
              This helps us personalize your meal and calorie targets.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--gray)]">
                  Your name
                </label>
                <input
                  aria-label="Your name"
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
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
                        inner.sex === s
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
                optional
                valueInBase={step1Weight}
                onChange={(v) => {
                  setStep1Weight(v);
                  setStep1Errors((er) => ({ ...er, weightKg: undefined }));
                }}
                error={step1Errors.weightKg}
              />
              <p className="text-[11px] leading-relaxed text-[var(--gray)]">
                Optional — used for calorie target estimates only.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm md:p-6">
            <h2 className="font-playfair text-xl text-[var(--green)]">Your lifestyle</h2>
            <div className="mt-4">
              <LifestyleProfileSection
                goal={inner.goal}
                activityLevel={inner.activityLevel}
                motivation={motivation}
                onGoalChange={(k) => update("goal", k)}
                onActivityChange={(k) => update("activityLevel", k)}
                onMotivationChange={applyMotivation}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--white)] p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[var(--gray)]">
                Household
              </p>
              <label className="block text-xs text-[var(--gray)]">
                People you usually cook for
              </label>
              <input
                type="number"
                min={1}
                max={8}
                className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                value={inner.householdSize ?? 1}
                onChange={(e) =>
                  update(
                    "householdSize",
                    Math.min(8, Math.max(1, Number(e.target.value) || 1))
                  )
                }
              />
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--green)]"
                  checked={inner.kidFriendly ?? false}
                  onChange={(e) => update("kidFriendly", e.target.checked)}
                />
                Prefer kid-friendly, simple recipes when possible
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm md:p-6">
            <h2 className="font-playfair text-xl text-[var(--green)]">Health focus</h2>
            <p className="mt-1 text-xs text-[var(--gray)]">
              Optional — we use this to prioritise certain meals in suggestions.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
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
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm md:p-6">
            <h2 className="font-playfair text-xl text-[var(--green)]">Cooking skill level</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {COOKING_SKILL_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs ${
                    cookingSkill === id
                      ? "border-[var(--green)] bg-[var(--green)] text-white"
                      : "border-[var(--border)]"
                  }`}
                  onClick={() => setCookingSkill(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm md:p-6">
            <h2 className="font-playfair text-xl text-[var(--green)]">Food preferences</h2>
            <div className="mt-4 space-y-4">
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
                    onClick={() => setDietStyleKey(null)}
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
                      onClick={() => setDietStyleKey(d)}
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
                        inner.allergies.includes(a)
                          ? "border-[var(--green)] bg-[var(--green)] text-white"
                          : "border-[var(--border)]"
                      }`}
                      onClick={() => {
                        if (a === "None") return update("allergies", ["None"]);
                        const has = inner.allergies.includes(a);
                        const next = has
                          ? inner.allergies.filter((x) => x !== a)
                          : [...inner.allergies.filter((x) => x !== "None"), a];
                        update("allergies", next);
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text)]">
                  Preferred cuisine
                </p>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_CUISINE_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`rounded-full border px-3 py-2 text-xs ${
                        selectedCuisines.includes(c)
                          ? "border-[var(--green)] bg-[var(--green-pale)] text-[var(--green)]"
                          : "border-[var(--border)]"
                      }`}
                      onClick={() => togglePreferredCuisine(c)}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-2 text-xs ${
                      selectedCuisines.length === 0
                        ? "border-[var(--green)] bg-[var(--green)] text-white"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => togglePreferredCuisine("No preference")}
                  >
                    No preference
                  </button>
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
                {inner.dislikedFoods.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inner.dislikedFoods.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-3 py-1 text-xs font-medium text-[var(--green)]"
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
          </section>

        </div>

        <div className="fixed bottom-0 left-0 right-0 z-[101] border-t border-[var(--border)] bg-[var(--cream)]/95 px-4 py-4 backdrop-blur md:static md:z-auto md:mt-8 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
          <div className="mx-auto flex max-w-[680px] gap-3">
            <button
              type="button"
              className="flex-1 rounded-full border border-[var(--border)] py-3 text-sm text-[var(--gray)]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 rounded-full bg-[var(--green)] py-3 text-sm font-medium text-white"
              onClick={handleSave}
            >
              Save changes
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
