
import type { AchievementUnlock } from "@/lib/gamification";

type Props = {
  achievement: AchievementUnlock | null;
  onDismiss: () => void;
};

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
        <p className="text-3xl">🎉</p>
        <h2 id="achievement-title" className="mt-2 font-playfair text-2xl text-[var(--green)]">
          Achievement Unlocked!
        </h2>
        <p className="mt-3 text-4xl">{achievement.emoji}</p>
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
