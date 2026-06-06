/** Hardcoded friendly reminder copy — picked at random per situation. */

export type ReminderKind = "meal" | "water" | "streak_active" | "streak_start";

export const MEAL_REMINDER_MESSAGES = [
  "🍳 Hey chef — log a meal and keep your day on track!",
  "🥗 A quick meal log takes seconds and helps so much ✨",
  "🍽️ What did you eat? Your coach is curious 👀",
  "🌿 Small logs, big wins — tap to log your meal!",
  "💚 Fuel check! Log breakfast, lunch, or dinner when you can.",
  "🧑‍🍳 Your progress rings miss you — log a meal today!",
] as const;

export const WATER_REMINDER_MESSAGES = [
  "💧 Sip sip! Log a glass of water when you get a chance.",
  "🌊 Hydration hug — your body loves you for drinking water!",
  "✨ Water break? Tap to log a glass in ChefCoach 💙",
  "🫧 A little H₂O goes a long way — stay refreshed!",
  "💦 Friendly nudge: grab some water, you’ve got this!",
  "🥤 Hydration check — future you says thanks 🙌",
] as const;

export const STREAK_ACTIVE_MESSAGES = [
  "🔥 Your streak is glowing — log a meal to keep it alive!",
  "⭐ One meal today keeps the flame going 🔥",
  "🏆 Streak mode on! Don’t let today slip by without a log.",
  "💪 You’re on a roll — finish strong with a meal log!",
  "🌟 Almost there — log any meal to protect your streak!",
] as const;

export const STREAK_START_MESSAGES = [
  "🌱 Start a streak today — log one meal and you’re in!",
  "✨ Day one energy — log a meal and begin your streak!",
  "🔥 Every streak starts with one meal — you’ve got this!",
  "💚 Small step today, big habit tomorrow — log a meal!",
  "🎯 Ready for a streak? Log what you ate and go!",
] as const;

export function pickReminderMessage(kind: ReminderKind, streakCount?: number): string {
  const pool =
    kind === "meal"
      ? MEAL_REMINDER_MESSAGES
      : kind === "water"
        ? WATER_REMINDER_MESSAGES
        : kind === "streak_active"
          ? STREAK_ACTIVE_MESSAGES
          : STREAK_START_MESSAGES;

  const base = pool[Math.floor(Math.random() * pool.length)];
  if (kind === "streak_active" && streakCount && streakCount > 1) {
    const extras = [
      `🔥 ${streakCount} days strong — one meal keeps it going!`,
      `⭐ ${streakCount}-day streak! Log today to stay on fire.`,
      `🏆 ${streakCount} days in a row — protect it with a meal log!`,
    ];
    if (Math.random() < 0.45) {
      return extras[Math.floor(Math.random() * extras.length)];
    }
  }
  return base;
}
