
import type { DietFilter, TimeFilter, UserProfile } from "@/types";

type Props = {
  profile: UserProfile | null;
  selectedTime: TimeFilter;
  selectedDiet: DietFilter;
  onApplySuggestedFilters: (time: TimeFilter, dietFromProfile: DietFilter | null) => void;
};

function goalPhrase(goal: UserProfile["goal"] | undefined): string {
  if (goal === "lose_weight") return "weight loss";
  if (goal === "build_muscle") return "muscle";
  return "maintenance";
}

function firstDietTagFromProfile(profile: UserProfile | null): DietFilter | null {
  const dp = profile?.dietaryPreference;
  if (!dp || dp === "None") return null;
  const tag = dp.split(",")[0]?.trim();
  if (tag === "Vegetarian" || tag === "Vegan" || tag === "Keto" || tag === "Gluten-free") {
    return tag;
  }
  return null;
}

export function WhatToCookNowCard({
  profile,
  selectedTime,
  selectedDiet,
  onApplySuggestedFilters,
}: Props) {
  const hour = new Date().getHours();
  let title: string;
  let body: string;
  let suggestTime: TimeFilter;

  if (hour >= 5 && hour < 11) {
    title = "🌅 Good time for breakfast";
    body = "Quick high-protein options take under 15 mins";
    suggestTime = "15";
  } else if (hour >= 11 && hour < 15) {
    title = "☀️ Lunch time";
    body = "Balanced meals to keep your energy up";
    suggestTime = "30";
  } else if (hour >= 15 && hour < 20) {
    title = "🌙 Dinner ideas";
    body = `End the day hitting your ${goalPhrase(profile?.goal)} goals`;
    suggestTime = "60";
  } else {
    return null;
  }

  const dietTag = firstDietTagFromProfile(profile);
  const applied =
    selectedTime === suggestTime && (dietTag == null || selectedDiet === dietTag);

  return (
    <section className="mx-auto max-w-[600px] px-5 pb-3">
      <div className="rounded-[12px] border-l-[3px] border-[var(--green)] bg-[var(--cream)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--gray)]">{body}</p>
        <button
          type="button"
          onClick={() => onApplySuggestedFilters(suggestTime, dietTag)}
          className="mt-3 rounded-full border border-[var(--green)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--green)] transition hover:bg-[var(--green-pale)] active:scale-95"
        >
          {applied ? "✓ Filters applied" : "Apply filter"}
        </button>
      </div>
    </section>
  );
}
