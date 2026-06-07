
import type { AchievementUnlock } from "@/lib/gamification";
import {
  CameraIcon,
  FlameIcon,
  MacroProteinIcon,
  TrophyIcon,
} from "@/components/icons/AppIcons";
import { Sprout } from "lucide-react";
import type { ComponentType } from "react";

type Props = {
  achievement: AchievementUnlock | null;
  onDismiss: () => void;
};

const ACHIEVEMENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "🌱": Sprout,
  "🔥": FlameIcon,
  "💪": MacroProteinIcon,
  "📸": CameraIcon,
};

function AchievementBadgeIcon({ emoji }: { emoji: string }) {
  const Icon = ACHIEVEMENT_ICONS[emoji] ?? TrophyIcon;
  return <Icon className="h-12 w-12 text-[var(--green)]" aria-hidden />;
}

export function AchievementCelebration({ achievement, onDismiss }: Props) {
  if (!achievement) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="achievement-title"
    >
      <div className="relative z-[1] w-full max-w-[360px] rounded-3xl bg-[var(--white)] p-6 text-center shadow-2xl">
        <div className="flex justify-center">
          <TrophyIcon className="h-10 w-10 text-[var(--orange)]" aria-hidden />
        </div>
        <h2 id="achievement-title" className="mt-2 font-playfair text-2xl text-[var(--green)]">
          Achievement Unlocked!
        </h2>
        <div className="mt-3 flex justify-center">
          <AchievementBadgeIcon emoji={achievement.emoji} />
        </div>
        <p className="mt-2 text-lg font-semibold text-[var(--text)]">{achievement.title}</p>
        <p className="mt-2 text-sm text-[var(--gray)]">{achievement.description}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full rounded-full bg-[var(--green)] px-5 py-3 text-sm font-semibold text-white"
        >
          Keep it up!
        </button>
      </div>
    </div>
  );
}
