import { useState } from "react";
import { AlertIcon, BanIcon, IconLabel } from "@/components/icons/AppIcons";

type Props = {
  /** Allergens the meal contains (e.g. ["dairy", "gluten"]). */
  allergens: string[];
  /** User's own flagged allergens — if any overlap a red banner is shown. */
  userAllergens?: string[];
  /** When true the red-flag banner is hidden by default with a "Show anyway" toggle. */
  hideByDefault?: boolean;
};

/**
 * AllergenBadge — shown on every recipe/meal card throughout the app.
 *
 * Safety rule: always show allergen info, even when the user has no restrictions.
 */
export function AllergenBadge({ allergens, userAllergens = [], hideByDefault = true }: Props) {
  const [showAnyway, setShowAnyway] = useState(false);

  if (allergens.length === 0) return null;

  const flaggedByUser = allergens.filter((a) =>
    userAllergens.map((u) => u.toLowerCase()).includes(a.toLowerCase())
  );
  const hasFlaggedAllergen = flaggedByUser.length > 0;

  if (hasFlaggedAllergen && hideByDefault && !showAnyway) {
    return (
      <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs">
        <p className="flex items-start gap-1.5 font-semibold text-red-700">
          <BanIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This dish may not be safe for your dietary profile</span>
        </p>
        <p className="mt-0.5 pl-5 text-red-600">Contains: {flaggedByUser.join(", ")}</p>
        <button
          type="button"
          onClick={() => setShowAnyway(true)}
          className="mt-1 pl-5 font-medium text-red-500 underline"
        >
          Show anyway
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      {hasFlaggedAllergen && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-xs">
          <p className="flex items-start gap-1.5 font-semibold text-red-700">
            <BanIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This dish may not be safe for your dietary profile</span>
          </p>
          <p className="mt-0.5 pl-5 text-red-600">Flagged: {flaggedByUser.join(", ")}</p>
        </div>
      )}
      <p className="rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
        <IconLabel icon={<AlertIcon className="h-3.5 w-3.5" />}>
          Contains: {allergens.join(", ")} — check labels before cooking
        </IconLabel>
      </p>
    </div>
  );
}
