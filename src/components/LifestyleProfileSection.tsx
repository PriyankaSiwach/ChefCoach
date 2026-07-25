import type { ReactNode } from "react";
import type { UserGoal, UserProfile } from "@/types";
import {
  ChefHatIcon,
  HeartIcon,
  IconLabel,
  MacroProteinIcon,
  SparklesIcon,
  TargetIcon,
  UserIcon,
} from "@/components/icons/AppIcons";
import { Scale } from "lucide-react";

export type Motivation = "fun" | "just_cooking" | "health" | "family";

const CHIP_SELECTED =
  "border-[var(--green)] bg-[var(--green)] text-white shadow-sm";
const CHIP_UNSELECTED =
  "border-[var(--border)] bg-[var(--white)] text-[var(--text)]";

const GOALS: { k: UserGoal; l: string; Icon: typeof TargetIcon }[] = [
  { k: "lose_weight", l: "Lose weight", Icon: TargetIcon },
  { k: "build_muscle", l: "Build muscle", Icon: MacroProteinIcon },
  { k: "maintain_weight", l: "Stay balanced", Icon: Scale },
];

const ACTIVITY_LEVELS: {
  k: UserProfile["activityLevel"];
  l: string;
  hint: string;
}[] = [
  { k: "sedentary", l: "Mostly sitting", hint: "Desk job / low movement" },
  { k: "light", l: "Lightly active", hint: "Some walking or light activity" },
  { k: "gym_regular", l: "Gym regular", hint: "Works out weekly" },
  { k: "athlete", l: "Very active", hint: "Daily exercise or physical job" },
];

function IconLabelLocal({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {children}
    </span>
  );
}

type Props = {
  goal: UserProfile["goal"];
  activityLevel: UserProfile["activityLevel"];
  motivation: Motivation;
  onGoalChange: (goal: UserProfile["goal"]) => void;
  onActivityChange: (level: UserProfile["activityLevel"]) => void;
  onMotivationChange: (m: Motivation) => void;
};

export function LifestyleProfileSection({
  goal,
  activityLevel,
  motivation,
  onGoalChange,
  onActivityChange,
  onMotivationChange,
}: Props) {
  return (
    <div className="space-y-6">
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray)]">
          What is your main goal?
        </p>
        <div className="flex flex-wrap gap-2 sm:gap-2.5">
          {GOALS.map(({ k, l, Icon }) => {
            const selected = goal === k;
            return (
              <button
                key={k}
                type="button"
                className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                  selected ? CHIP_SELECTED : CHIP_UNSELECTED
                }`}
                onClick={() => onGoalChange(k)}
              >
                <IconLabelLocal icon={<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}>
                  {l}
                </IconLabelLocal>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray)]">
          How active are you?
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACTIVITY_LEVELS.map(({ k, l, hint }) => {
            const selected = activityLevel === k;
            return (
              <button
                key={k}
                type="button"
                className={`rounded-2xl border px-3.5 py-2.5 text-left transition ${
                  selected ? CHIP_SELECTED : CHIP_UNSELECTED
                }`}
                onClick={() => onActivityChange(k)}
              >
                <span className="block text-xs font-semibold leading-snug">{l}</span>
                <span
                  className={`mt-0.5 block text-[10px] leading-snug ${
                    selected ? "text-white/85" : "text-[var(--gray)]"
                  }`}
                >
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pt-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray)]">
          What brings you here?
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onMotivationChange("fun")}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              motivation === "fun"
                ? "border-[var(--green)] bg-[var(--green)] text-white"
                : "border-[var(--border)] bg-[var(--white)]"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <SparklesIcon className="h-4 w-4 shrink-0" />
              For fun
            </p>
            <p
              className={`mt-1 text-xs ${
                motivation === "fun" ? "text-white/85" : "text-[var(--gray)]"
              }`}
            >
              I want healthy ideas and variety.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onMotivationChange("just_cooking")}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              motivation === "just_cooking"
                ? "border-[var(--green)] bg-[var(--green)] text-white"
                : "border-[var(--border)] bg-[var(--white)]"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ChefHatIcon className="h-4 w-4 shrink-0" />
              Just for cooking
            </p>
            <p
              className={`mt-1 text-xs ${
                motivation === "just_cooking" ? "text-white/85" : "text-[var(--gray)]"
              }`}
            >
              Keep it simple and easy to cook.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onMotivationChange("health")}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              motivation === "health"
                ? "border-[var(--green)] bg-[var(--green)] text-white"
                : "border-[var(--border)] bg-[var(--white)]"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <HeartIcon className="h-4 w-4 shrink-0" />
              Managing health
            </p>
            <p
              className={`mt-1 text-xs ${
                motivation === "health" ? "text-white/85" : "text-[var(--gray)]"
              }`}
            >
              I want to eat better for my wellbeing.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onMotivationChange("family")}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              motivation === "family"
                ? "border-[var(--green)] bg-[var(--green)] text-white"
                : "border-[var(--border)] bg-[var(--white)]"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <UserIcon className="h-4 w-4 shrink-0" />
              Feeding a family
            </p>
            <p
              className={`mt-1 text-xs ${
                motivation === "family" ? "text-white/85" : "text-[var(--gray)]"
              }`}
            >
              I need practical meals for multiple people.
            </p>
          </button>
        </div>
      </section>
    </div>
  );
}
