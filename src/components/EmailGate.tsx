
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";
import { saveEmailGateSubmission } from "@/lib/trial";
import type { UserProfile } from "@/types";
import { readProfileFromStorage } from "@/lib/profileStorage";

const activityMult: Record<UserProfile["activityLevel"], number> = {
  sedentary: 1.2,
  light: 1.375,
  gym_regular: 1.55,
  athlete: 1.725,
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function readStoredProfile(): UserProfile | null {
  return readProfileFromStorage();
}

function computeDailyTargets(profile: UserProfile) {
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
}

function displayNameFromProfile(profile: UserProfile | null): string {
  if (!profile?.name?.trim()) return "there";
  const t = profile.name.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function goalBadgeForProfile(profile: UserProfile | null): string {
  if (!profile) return "Your goals";
  switch (profile.goal) {
    case "build_muscle":
      return "💪 Build muscle";
    case "lose_weight":
      return "🎯 Lose weight";
    default:
      return "⚖️ Maintain";
  }
}

function activityLabelForProfile(profile: UserProfile | null): string {
  if (!profile) return "your routine";
  switch (profile.activityLevel) {
    case "sedentary":
      return "Sedentary";
    case "light":
      return "Lightly active";
    case "gym_regular":
      return "Gym regular";
    case "athlete":
      return "Athlete";
    default:
      return "Your activity";
  }
}

function dietLabelForProfile(profile: UserProfile | null): string {
  if (!profile) return "Balanced";
  if (profile.dietaryPreference === "None") return "Balanced";
  return profile.dietaryPreference;
}

type Props = {
  onComplete: () => void;
};

export function EmailGate({ onComplete }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [storedProfile, setStoredProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    setStoredProfile(readStoredProfile());
  }, []);

  const planPreview = useMemo(() => {
    if (!storedProfile) return null;
    return computeDailyTargets(storedProfile);
  }, [storedProfile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Please enter a valid email");
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      return;
    }
    setError(null);
    const run = async () => {
      setLoading(true);
      const normalized = email.trim().toLowerCase();
      try {
        await fetch(apiUrl("/api/clerk-sync"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalized }),
        });
      } catch {
        // non-blocking: local signup still proceeds
      }
      saveEmailGateSubmission(normalized);
      window.setTimeout(() => {
        setLoading(false);
        onComplete();
      }, 400);
    };
    void run();
  };

  const handleSocialSignIn = (provider: "apple" | "google") => {
    setError(null);
    const run = async () => {
      setLoading(true);
      const syntheticEmail = `${provider}_user_${Date.now()}@recipify.app`;
      try {
        await fetch(apiUrl("/api/clerk-sync"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: syntheticEmail }),
        });
      } catch {
        // non-blocking: local signup still proceeds
      }
      saveEmailGateSubmission(syntheticEmail);
      window.setTimeout(() => {
        setLoading(false);
        onComplete();
      }, 400);
    };
    void run();
  };

  const previewName = displayNameFromProfile(storedProfile);
  const goalBadge = goalBadgeForProfile(storedProfile);
  const activityLine = activityLabelForProfile(storedProfile);
  const dietLine = dietLabelForProfile(storedProfile);

  return (
    <div className="flex min-h-[100dvh] min-h-screen flex-col bg-[#2D5016]">
      {/* Green header — ~40% viewport */}
      <header className="flex min-h-[40vh] flex-col justify-center px-6 pb-6 pt-10">
        <p className="font-playfair text-2xl tracking-tight text-white">
          Recipi<span className="text-white/85">fy</span>
        </p>

        <div className="mt-6 rounded-[16px] bg-white/15 p-4">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <p className="text-[18px] font-bold text-[var(--cream)]">
              Your plan, {previewName}
            </p>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--cream)]">
              {goalBadge}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-[13px] leading-snug text-[var(--cream)]">
              🔥{" "}
              <span className="font-semibold tabular-nums">
                {planPreview ? planPreview.tdee.toLocaleString() : "—"}
              </span>{" "}
              kcal/day
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-[13px] leading-snug text-[var(--cream)]">
              💪{" "}
              <span className="font-semibold tabular-nums">{planPreview ? planPreview.protein : "—"}</span>g
              protein
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-[13px] leading-snug text-[var(--cream)]">
              🍞{" "}
              <span className="font-semibold tabular-nums">{planPreview ? planPreview.carbs : "—"}</span>g carbs
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-[13px] leading-snug text-[var(--cream)]">
              🥑 <span className="font-semibold tabular-nums">{planPreview ? planPreview.fat : "—"}</span>g fat
            </div>
          </div>

          <p className="mt-3 text-center text-[12px] leading-snug text-[var(--cream)]/70">
            Personalized for {activityLine} • {dietLine}
          </p>
        </div>

        <p className="mt-5 text-center text-[14px] italic text-[var(--cream)]/80">
          Enter your email to unlock this plan
        </p>
      </header>

      {/* White card — ~60% viewport, slides up visually */}
      <section className="flex min-h-[60vh] flex-1 flex-col rounded-t-[24px] bg-white p-8 pb-10 shadow-[0_-12px_48px_rgba(0,0,0,0.12)]">
        <div className="mx-auto w-full max-w-md flex-1">
          <h2 className="text-center font-playfair text-[20px] leading-snug text-[#2D5016]">Almost There</h2>
          <p className="mt-2 text-center text-[14px] leading-snug text-[var(--gray)]">
            Enter your email to unlock your 3 free fridge scans
          </p>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSocialSignIn("apple")}
              className="flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border)] bg-white text-sm font-medium text-[var(--text)] transition hover:bg-[var(--gray-light)] disabled:opacity-70"
            >
               Continue with Apple
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSocialSignIn("google")}
              className="flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border)] bg-white text-sm font-medium text-[var(--text)] transition hover:bg-[var(--gray-light)] disabled:opacity-70"
            >
              Continue with Google
            </button>
          </div>

          <form className="mt-8" onSubmit={handleSubmit} noValidate>
            <label className="sr-only" htmlFor="email-gate-input">
              Email
            </label>
            <input
              id="email-gate-input"
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={(ev) => {
                setEmail(ev.target.value);
                setError(null);
              }}
              disabled={loading}
              className={`h-12 w-full rounded-xl border-[1.5px] bg-white px-4 text-base text-[var(--text)] outline-none transition placeholder:text-[var(--gray)]/50 focus:border-[var(--green)] ${
                error ? "border-red-500" : "border-[var(--border)]"
              } ${shake ? "email-gate-shake" : ""}`}
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 flex h-[52px] w-full items-center justify-center rounded-xl bg-[var(--green)] text-[15px] font-semibold text-white transition hover:bg-[var(--green-light)] disabled:opacity-70"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Start Free Trial →"
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-[var(--gray)]">No credit card required</p>
          <p className="mt-3 text-center text-[11px] text-[var(--gray)]">🔒 We never spam</p>
        </div>
      </section>
    </div>
  );
}
