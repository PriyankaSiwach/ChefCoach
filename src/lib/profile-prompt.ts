import type { UserProfile } from "@/types";
import { buildUserDietaryRestrictionsPrompt } from "@/lib/dietConstants";

/** Dietary restrictions for AI prompts (diet, allergies, dislikes). */
export function profileDietaryRestrictionsPrompt(
  profile: UserProfile | null | undefined
): string {
  return buildUserDietaryRestrictionsPrompt(profile);
}

/** Extra prompt lines for recipe generation from profile (household, kids, budget, protein week). */
export function profilePromptExtras(profile: UserProfile | null | undefined): string {
  const dietary = buildUserDietaryRestrictionsPrompt(profile);
  if (!profile) return dietary;

  const parts: string[] = [];
  if (dietary) parts.push(dietary.trim());

  const h = Math.min(8, Math.max(1, profile.householdSize ?? 1));
  parts.push(`Scale mindset for ${h} serving${h === 1 ? "" : "s"} where relevant.`);
  if (profile.kidFriendly) {
    parts.push("Use clear, approachable language; suitable for mixed-age households.");
  }
  if (profile.weeklyFoodBudgetUsd != null && profile.weeklyFoodBudgetUsd > 0) {
    parts.push(
      `User is mindful of budget (~$${profile.weeklyFoodBudgetUsd}/week for groceries) — suggest economical swaps when it helps.`
    );
  }
  if (profile.proteinForwardWeek) {
    parts.push("This week, lean toward higher-protein options when it fits the ingredients.");
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}
