
import type { DietFilter } from "@/types";

export type LifestyleProfile = {
  age: string;
  gender: "female" | "male" | "other";
  height: string;
  weight: string;
  goal: "lose weight" | "maintain weight" | "gain muscle";
  activityLevel: "low" | "moderate" | "high";
  goesToGym: "yes" | "no";
  dietaryPreference: DietFilter;
  allergies: string;
  dislikedFoods: string;
};

type Props = {
  profile: LifestyleProfile;
  onChange: (next: LifestyleProfile) => void;
  onGenerateDietPlan: () => void;
  generating: boolean;
};

export function UserProfileSetupSection({
  profile,
  onChange,
  onGenerateDietPlan,
  generating,
}: Props) {
  const patch = <K extends keyof LifestyleProfile>(
    key: K,
    value: LifestyleProfile[K]
  ) => {
    onChange({ ...profile, [key]: value });
  };
  return (
    <section className="mx-auto max-w-[600px] px-5 pb-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-5">
        <h2 className="font-playfair text-3xl text-[var(--green)]">
          User Profile Setup
        </h2>
        <p className="mt-2 text-sm text-[var(--gray)]">
          Share your lifestyle so the app can generate a personalized daily diet
          plan.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Age</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.age} onChange={(e) => patch("age", e.target.value)} placeholder="28" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Gender</span>
            <select className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.gender} onChange={(e) => patch("gender", e.target.value as LifestyleProfile["gender"])}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Height (cm)</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.height} onChange={(e) => patch("height", e.target.value)} placeholder="165" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Weight (kg)</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.weight} onChange={(e) => patch("weight", e.target.value)} placeholder="62" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Goal</span>
            <select className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.goal} onChange={(e) => patch("goal", e.target.value as LifestyleProfile["goal"])}>
              <option value="lose weight">Lose weight</option>
              <option value="maintain weight">Maintain weight</option>
              <option value="gain muscle">Gain muscle</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Activity level</span>
            <select className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.activityLevel} onChange={(e) => patch("activityLevel", e.target.value as LifestyleProfile["activityLevel"])}>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Do you go to gym?</span>
            <select className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.goesToGym} onChange={(e) => patch("goesToGym", e.target.value as LifestyleProfile["goesToGym"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Dietary preference</span>
            <select className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.dietaryPreference} onChange={(e) => patch("dietaryPreference", e.target.value as DietFilter)}>
              <option value="None">No filter</option>
              <option value="Vegetarian">Vegetarian</option>
              <option value="Vegan">Vegan</option>
              <option value="Keto">Keto</option>
              <option value="Gluten-free">Gluten-free</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Allergies</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.allergies} onChange={(e) => patch("allergies", e.target.value)} placeholder="e.g. peanuts, shellfish" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--gray)]">Foods you dislike</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-sm outline-none focus:border-[var(--green-light)]" value={profile.dislikedFoods} onChange={(e) => patch("dislikedFoods", e.target.value)} placeholder="e.g. mushrooms, olives" />
          </label>
        </div>
        <button onClick={onGenerateDietPlan} disabled={generating} className="mt-5 w-full rounded-full bg-[var(--green)] px-4 py-3 font-playfair text-lg text-white disabled:opacity-50">
          {generating ? "Generating diet plan..." : "Generate Diet Plan"}
        </button>
      </div>
    </section>
  );
}
